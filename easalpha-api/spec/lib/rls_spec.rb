require "rails_helper"

# Row-Level Security is the second wall: even raw SQL as the app role cannot read another business.
# Rows are inserted and cleaned up on the raw connection so they are committed and visible to it.
RSpec.describe "Row-Level Security" do
  it "hides other businesses' rows from the easalpha_app role unless the session variable is set" do
    cfg = ActiveRecord::Base.connection_db_config.configuration_hash
    conn = PG.connect(host: cfg[:host], port: cfg[:port], dbname: cfg[:database], user: "easalpha_app", password: ENV.fetch("EASALPHA_APP_DB_PASSWORD", "easalpha_app"))
    a = SecureRandom.uuid
    b = SecureRandom.uuid
    conn.exec("INSERT INTO businesses (id, name, slug, created_at, updated_at) VALUES ('#{a}', 'RLS A', 'rls-a-#{a[0, 6]}', now(), now()), ('#{b}', 'RLS B', 'rls-b-#{b[0, 6]}', now(), now())")
    insert = ->(biz, code) { "INSERT INTO branches (id, business_id, name, code, time_zone, day_end_time, created_at, updated_at) VALUES (gen_random_uuid(), '#{biz}', 'RLS branch', '#{code}', 'Asia/Karachi', '04:00', now(), now())" }

    expect { conn.exec(insert.call(a, "X1")) }.to raise_error(PG::InsufficientPrivilege), "insert without a tenant must be refused"
    conn.exec("SET app.current_business_id = '#{a}'")
    conn.exec(insert.call(a, "A1"))
    expect(conn.exec("SELECT count(*) FROM branches").getvalue(0, 0).to_i).to eq(1)
    expect { conn.exec(insert.call(b, "B1")) }.to raise_error(PG::InsufficientPrivilege), "insert for another business must be refused"
    conn.exec("SET app.current_business_id = '#{b}'")
    expect(conn.exec("SELECT count(*) FROM branches").getvalue(0, 0).to_i).to eq(0)
    conn.exec("RESET app.current_business_id")
    expect(conn.exec("SELECT count(*) FROM branches").getvalue(0, 0).to_i).to eq(0)
    # The unscoped paths (login, super admin, jobs) set the bypass flag and see every business; off again, nothing.
    conn.exec("SET app.rls_bypass = 'on'")
    expect(conn.exec("SELECT count(*) FROM branches WHERE business_id IN ('#{a}', '#{b}')").getvalue(0, 0).to_i).to eq(1)
    conn.exec("SET app.rls_bypass = 'off'")
    expect(conn.exec("SELECT count(*) FROM branches").getvalue(0, 0).to_i).to eq(0)
  ensure
    if conn
      conn.exec("RESET app.current_business_id; RESET app.rls_bypass") rescue nil
      ActiveRecord::Base.connection.execute("DELETE FROM branches WHERE business_id IN ('#{a}', '#{b}')")
      ActiveRecord::Base.connection.execute("DELETE FROM businesses WHERE id IN ('#{a}', '#{b}')")
      conn.close
    end
  end

  def connect(user:, password:)
    cfg = ActiveRecord::Base.connection_db_config.configuration_hash
    PG.connect(host: cfg[:host], port: cfg[:port], dbname: cfg[:database], user: user, password: password)
  end

  def app_role = connect(user: "easalpha_app", password: ENV.fetch("EASALPHA_APP_DB_PASSWORD", "easalpha_app"))

  # R9: the health endpoint's rls flag is this check on the API's own connection.
  it "says the policies bind the easalpha_app role and not a superuser" do
    app = app_role
    as_app = Struct.new(:pg) { def select_value(sql) = pg.exec(sql).getvalue(0, 0) }.new(app)
    expect(EasAlpha::Rls.active?(as_app)).to be(true)
    expect(EasAlpha::Rls.active?).to be(false) # the specs connect as postgres
  ensure
    app&.close
  end

  # With EASALPHA_APP_DB_PASSWORD set the app role also writes the other databases (Solid Cable's in production), whose
  # tables the owner made at db:prepare: without the grants every live update failed to broadcast. The probe table is
  # made by the owner and committed, then its grants are taken away, as in a database db:rls never reached.
  it "grants the app role a database whose tables the owner made" do
    cfg = ActiveRecord::Base.connection_db_config.configuration_hash
    owner = connect(user: cfg[:username], password: cfg[:password])
    table = "rls_grant_probe_#{SecureRandom.hex(4)}"
    owner.exec("CREATE TABLE #{table} (id bigserial PRIMARY KEY, body text)")
    owner.exec("REVOKE ALL ON #{table} FROM easalpha_app; REVOKE ALL ON SEQUENCE #{table}_id_seq FROM easalpha_app")
    app = app_role
    expect { app.exec("INSERT INTO #{table} (body) VALUES ('before')") }.to raise_error(PG::InsufficientPrivilege)
    EasAlpha::Rls.grant_database!(cfg)
    app.exec("INSERT INTO #{table} (body) VALUES ('after')")
    expect(app.exec("SELECT body FROM #{table}").values).to eq([ [ "after" ] ])
  ensure
    app&.close
    owner&.exec("DROP TABLE IF EXISTS #{table}")
    owner&.close
  end

  it "grants every other database of the environment, not the primary one again" do
    primary = ActiveRecord::Base.connection_db_config
    cable = ActiveRecord::DatabaseConfigurations::HashConfig.new(Rails.env, "cable", primary.configuration_hash.merge(database: "easalpha_production_cable"))
    allow(ActiveRecord::Base.configurations).to receive(:configs_for).with(env_name: Rails.env).and_return([ primary, cable ])
    allow(EasAlpha::Rls).to receive(:grant_database!)
    EasAlpha::Rls.grant_other_databases!
    expect(EasAlpha::Rls).to have_received(:grant_database!).once.with(hash_including(database: "easalpha_production_cable"))
  end
end

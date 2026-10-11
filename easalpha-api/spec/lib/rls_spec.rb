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
  ensure
    if conn
      conn.exec("RESET app.current_business_id") rescue nil
      ActiveRecord::Base.connection.execute("DELETE FROM branches WHERE business_id IN ('#{a}', '#{b}')")
      ActiveRecord::Base.connection.execute("DELETE FROM businesses WHERE id IN ('#{a}', '#{b}')")
      conn.close
    end
  end
end

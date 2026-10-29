# Row-Level Security: the second wall behind application scoping.
# Policies read app.current_business_id, which the API sets on every request. The paths that legitimately see every
# business (a login looking up memberships, the super admin, jobs, seeds) run inside Tenancy::Context.unscoped, which
# sets app.rls_bypass; the policy lets those through. The flag is session state on the connection, set and reset with
# the Current attributes, so it never outlives the block that set it. The API connects as the easalpha_app role
# (EASALPHA_APP_DB_PASSWORD, bin/start) for any of this to apply; a superuser ignores policies.
module EasAlpha
  module Rls
    module_function

    def apply!(tables)
      conn = ActiveRecord::Base.connection
      # The role exists only where it has a real password (always in development and test, where the default is fine).
      role = ENV["EASALPHA_APP_DB_PASSWORD"].present? || !Rails.env.production?
      ensure_app_role!(conn) if role
      tables.each do |raw|
        table = conn.quote_table_name(raw)
        conn.execute("ALTER TABLE #{table} ENABLE ROW LEVEL SECURITY")
        conn.execute("ALTER TABLE #{table} FORCE ROW LEVEL SECURITY")
        conn.execute("DROP POLICY IF EXISTS tenant_isolation ON #{table}")
        conn.execute(<<~SQL)
          CREATE POLICY tenant_isolation ON #{table}
            USING (current_setting('app.rls_bypass', true) = 'on' OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
            WITH CHECK (current_setting('app.rls_bypass', true) = 'on' OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
        SQL
      end
      grant_app_role!(conn) if role
    end

    def ensure_app_role!(conn)
      password = ENV.fetch("EASALPHA_APP_DB_PASSWORD", "easalpha_app")
      conn.execute(<<~SQL)
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'easalpha_app') THEN
            CREATE ROLE easalpha_app LOGIN PASSWORD #{conn.quote(password)};
          END IF;
        END $$;
      SQL
      # The password follows the environment, so a rotated EASALPHA_APP_DB_PASSWORD takes effect at the next start.
      conn.execute("ALTER ROLE easalpha_app WITH LOGIN PASSWORD #{conn.quote(password)}") if ENV["EASALPHA_APP_DB_PASSWORD"].present?
    end

    def grant_app_role!(conn)
      conn.execute("GRANT USAGE ON SCHEMA public TO easalpha_app")
      conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO easalpha_app")
      conn.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO easalpha_app")
      conn.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO easalpha_app")
      conn.execute("GRANT CONNECT ON DATABASE #{conn.current_database} TO easalpha_app")
    end

    def set_business!(conn, business_id)
      conn.execute("SET app.current_business_id = #{conn.quote(business_id.to_s)}; SET app.rls_bypass = 'off'")
    end

    def reset!(conn)
      conn.execute("RESET app.current_business_id; RESET app.rls_bypass")
    end

    # Unscoped work (no business): the policy lets every row through while the flag is on.
    def bypass!(conn, on)
      conn.execute(on ? "RESET app.current_business_id; SET app.rls_bypass = 'on'" : "RESET app.rls_bypass")
    end

    def protected_tables
      ActiveRecord::Base.connection.select_values("SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity")
    end
  end
end

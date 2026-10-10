# Row-Level Security: the second wall behind application scoping.
# Policies read app.current_business_id, which the API sets on every request.
module Servio
  module Rls
    module_function

    def apply!(tables)
      conn = ActiveRecord::Base.connection
      ensure_app_role!(conn)
      tables.each do |raw|
        table = conn.quote_table_name(raw)
        conn.execute("ALTER TABLE #{table} ENABLE ROW LEVEL SECURITY")
        conn.execute("ALTER TABLE #{table} FORCE ROW LEVEL SECURITY")
        conn.execute("DROP POLICY IF EXISTS tenant_isolation ON #{table}")
        conn.execute(<<~SQL)
          CREATE POLICY tenant_isolation ON #{table}
            USING (business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
            WITH CHECK (business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid)
        SQL
      end
      grant_app_role!(conn)
    end

    def ensure_app_role!(conn)
      password = ENV.fetch("SERVIO_APP_DB_PASSWORD", "servio_app")
      conn.execute(<<~SQL)
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'servio_app') THEN
            CREATE ROLE servio_app LOGIN PASSWORD '#{password}';
          END IF;
        END $$;
      SQL
    end

    def grant_app_role!(conn)
      conn.execute("GRANT USAGE ON SCHEMA public TO servio_app")
      conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO servio_app")
      conn.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO servio_app")
      conn.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO servio_app")
      conn.execute("GRANT CONNECT ON DATABASE #{conn.current_database} TO servio_app")
    end

    def set_business!(conn, business_id)
      conn.execute("SET app.current_business_id = #{conn.quote(business_id.to_s)}")
    end

    def reset!(conn)
      conn.execute("RESET app.current_business_id")
    end

    def protected_tables
      ActiveRecord::Base.connection.select_values("SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity")
    end
  end
end

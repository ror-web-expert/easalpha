module EasAlpha
  # Database triggers that schema.rb cannot carry. Applied by migrations and again by the test suite after the schema loads.
  module Triggers
    module_function

    def apply!(conn = ActiveRecord::Base.connection)
      apply_audit_logs!(conn) if conn.table_exists?("audit_logs")
      apply_customer_adjustments!(conn) if conn.table_exists?("customer_adjustments")
      return unless conn.table_exists?("stock_ledger_entries")
      conn.execute(<<~SQL)
        CREATE OR REPLACE FUNCTION easalpha_block_ledger_change() RETURNS trigger AS $$
        BEGIN
          -- The only allowed update is linking the reversing row; every other column must stay as it was.
          IF TG_OP = 'UPDATE' AND OLD.reversed_by_entry_id IS NULL AND NEW.reversed_by_entry_id IS NOT NULL
             AND NEW.quantity = OLD.quantity AND NEW.before_qty = OLD.before_qty AND NEW.after_qty = OLD.after_qty AND NEW.kind = OLD.kind
             AND NEW.stock_item_id = OLD.stock_item_id AND NEW.stock_section_id = OLD.stock_section_id AND NEW.business_day = OLD.business_day
             AND NEW.unit_cost_minor = OLD.unit_cost_minor AND NEW.value_minor = OLD.value_minor AND NEW.occurred_at = OLD.occurred_at
             AND NEW.ref_id IS NOT DISTINCT FROM OLD.ref_id AND NEW.ref_table IS NOT DISTINCT FROM OLD.ref_table THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'stock_ledger_entries is insert-only; insert a reversing row instead';
        END $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS stock_ledger_insert_only ON stock_ledger_entries;
        CREATE TRIGGER stock_ledger_insert_only BEFORE UPDATE OR DELETE ON stock_ledger_entries
          FOR EACH ROW EXECUTE FUNCTION easalpha_block_ledger_change();
      SQL
    end

    # Customer account adjustments (opening balances, corrections) are insert-only: a mistake gets a reversal row.
    def apply_customer_adjustments!(conn)
      conn.execute(<<~SQL)
        CREATE OR REPLACE FUNCTION easalpha_block_customer_adjustment_change() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'customer_adjustments is insert-only; add a reversal instead';
        END $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS customer_adjustments_insert_only ON customer_adjustments;
        CREATE TRIGGER customer_adjustments_insert_only BEFORE UPDATE OR DELETE ON customer_adjustments
          FOR EACH ROW EXECUTE FUNCTION easalpha_block_customer_adjustment_change();
      SQL
    end

    # SPEC: the audit log is append-only; nothing can be changed or erased.
    def apply_audit_logs!(conn)
      conn.execute(<<~SQL)
        CREATE OR REPLACE FUNCTION easalpha_block_audit_change() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'audit_logs is append-only';
        END $$ LANGUAGE plpgsql;
        DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
        CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
          FOR EACH ROW EXECUTE FUNCTION easalpha_block_audit_change();
      SQL
    end
  end
end

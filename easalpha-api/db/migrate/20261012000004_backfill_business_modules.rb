# Customer accounts and payroll are now modules the owner switches on (off for new businesses). Businesses that already
# use them keep them: a business with khata activity gets customer accounts on, one with employees gets payroll on.
class BackfillBusinessModules < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      INSERT INTO settings (id, business_id, branch_id, key, value, created_at, updated_at)
      SELECT gen_random_uuid(), b.id, NULL, 'modules.customer_accounts', 'true'::jsonb, now(), now() FROM businesses b
      WHERE EXISTS (SELECT 1 FROM customers c WHERE c.business_id = b.id AND (c.balance_minor <> 0 OR c.credit_limit_minor IS NOT NULL))
         OR EXISTS (SELECT 1 FROM customer_payments p WHERE p.business_id = b.id)
         OR EXISTS (SELECT 1 FROM payments p WHERE p.business_id = b.id AND p.method_code = 'khata')
      ON CONFLICT DO NOTHING
    SQL
    execute <<~SQL
      INSERT INTO settings (id, business_id, branch_id, key, value, created_at, updated_at)
      SELECT gen_random_uuid(), b.id, NULL, 'modules.payroll', 'true'::jsonb, now(), now() FROM businesses b
      WHERE EXISTS (SELECT 1 FROM employees e WHERE e.business_id = b.id)
         OR EXISTS (SELECT 1 FROM payroll_runs r WHERE r.business_id = b.id)
      ON CONFLICT DO NOTHING
    SQL
    execute "UPDATE businesses SET settings_version = settings_version + 1 WHERE id IN (SELECT business_id FROM settings WHERE key IN ('modules.customer_accounts','modules.payroll'))"
  end

  def down
    execute "DELETE FROM settings WHERE key IN ('modules.customer_accounts','modules.payroll')"
  end
end

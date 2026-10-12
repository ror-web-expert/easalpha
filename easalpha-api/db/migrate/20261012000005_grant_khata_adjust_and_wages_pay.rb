# New permission codes khata.adjust (opening balances and balance corrections) and wages.pay (daily and weekly wages)
# go to every existing Manager role, as the Manager template grants them to new businesses.
class GrantKhataAdjustAndWagesPay < ActiveRecord::Migration[8.0]
  def up
    execute <<~SQL
      INSERT INTO role_permissions (id, business_id, role_id, permission_code, created_at, updated_at)
      SELECT gen_random_uuid(), r.business_id, r.id, code, now(), now()
      FROM roles r CROSS JOIN (VALUES ('khata.adjust'), ('wages.pay')) AS c(code)
      WHERE r.system_key = 'manager' AND r.archived_at IS NULL
      ON CONFLICT (role_id, permission_code) DO NOTHING
    SQL
  end

  def down
    execute "DELETE FROM role_permissions WHERE permission_code IN ('khata.adjust','wages.pay')"
  end
end

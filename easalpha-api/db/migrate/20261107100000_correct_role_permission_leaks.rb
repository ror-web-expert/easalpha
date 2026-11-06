# QA of 6 Nov 2026, P2: two roles held what they were meant to lack.
#
# Manager: the template took every code but payroll.manage, billing.manage and settings.manage, and so kept the SPEC code
# PAYROLL, which implies payroll.manage (and the payroll API checks PAYROLL itself). New businesses no longer get it
# (RoleTemplate.all_but). Existing Manager roles, and roles copied from one, lose PAYROLL where they do not hold
# payroll.manage; a role an owner gave payroll on purpose holds payroll.manage too, or was not made from the Manager.
#
# Cashier: Permission.expand ticked MARKETING_CAMPAIGN and MARKETING_CONTACTS for any role holding customers.manage. That
# is runtime and the code fix covers every role. But the per-user editor opens a role-mode member on that expanded set, so
# an owner who changed anything for a cashier saved the two codes as explicit grants. They go from custom sets that came
# that way: the member's role holds customers.manage and no SPEC code (the old rule ticked them), and the set has none of
# MARKETING, MARKETING_CAMPAIGN_LOG and MARKETING_AUTO_SEND_LOG, which that rule never ticked and every deliberate
# marketing grant (the Supervisor and Manager presets, Select all, the module ticked whole) includes.
#
# A migration rather than a one-off task: it must run once on every database the moment the code that stops granting
# these goes live, and a task depends on someone remembering to run it. Not undone on rollback: the leaked grants are
# not restored.
class CorrectRolePermissionLeaks < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      WITH RECURSIVE manager_roles AS (
        SELECT id FROM roles WHERE system_key = 'manager'
        UNION
        SELECT r.id FROM roles r JOIN manager_roles m ON r.copied_from_role_id = m.id
      )
      DELETE FROM role_permissions rp
      WHERE rp.permission_code = 'PAYROLL'
        AND rp.role_id IN (SELECT id FROM manager_roles)
        AND NOT EXISTS (SELECT 1 FROM role_permissions o WHERE o.role_id = rp.role_id AND o.permission_code = 'payroll.manage')
    SQL

    execute <<~SQL
      DELETE FROM user_permissions up
      USING memberships m
      WHERE up.membership_id = m.id
        AND m.permissions_mode = 'custom'
        AND up.permission_code IN ('MARKETING_CAMPAIGN', 'MARKETING_CONTACTS')
        AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = m.role_id AND rp.permission_code = 'customers.manage')
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = m.role_id AND rp.permission_code = upper(rp.permission_code))
        AND NOT EXISTS (
          SELECT 1 FROM user_permissions o
          WHERE o.membership_id = m.id AND o.permission_code IN ('MARKETING', 'MARKETING_CAMPAIGN_LOG', 'MARKETING_AUTO_SEND_LOG')
        )
    SQL
  end

  def down
    # Nothing to restore: see above.
  end
end

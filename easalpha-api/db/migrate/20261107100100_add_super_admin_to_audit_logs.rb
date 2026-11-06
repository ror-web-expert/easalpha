# QA of 6 Nov 2026, P3: what EasAlpha support does in a business on an approved session is logged as the support person,
# not as the owner whose membership the session acts through.
class AddSuperAdminToAuditLogs < ActiveRecord::Migration[8.1]
  def change
    add_column :audit_logs, :super_admin_id, :uuid
  end
end

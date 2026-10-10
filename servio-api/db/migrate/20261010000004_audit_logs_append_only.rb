# SPEC: the audit log is append-only, nothing erasable. The trigger lives in Servio::Triggers so the test suite applies it too.
class AuditLogsAppendOnly < ActiveRecord::Migration[8.0]
  def up
    add_index :audit_logs, [ :business_id, :user_id, :occurred_at ]
    add_index :audit_logs, [ :business_id, :action, :occurred_at ]
    Servio::Triggers.apply!
  end

  def down
    execute "DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs"
    remove_index :audit_logs, [ :business_id, :action, :occurred_at ]
    remove_index :audit_logs, [ :business_id, :user_id, :occurred_at ]
  end
end

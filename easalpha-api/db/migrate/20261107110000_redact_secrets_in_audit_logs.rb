# S1, 6 Nov 2026: a branch's tax-authority API token went into the audit log with every branch save (the branch
# form's before and after, and the automatic change row), and from there into the audit screen and its CSV. New rows
# are redacted as they are written (AuditLog.redact); this rewrites the rows already stored, replacing each secret
# value with "[redacted]" and nothing else. The append-only trigger is off only inside this one transaction.
class RedactSecretsInAuditLogs < ActiveRecord::Migration[8.1]
  def up
    say "#{AuditLog.redact_stored!} audit row(s) redacted"
  end

  def down
    # The values are gone; nothing to restore.
  end
end

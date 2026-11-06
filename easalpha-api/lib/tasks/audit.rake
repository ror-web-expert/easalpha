namespace :audit do
  desc "Replace secrets (API tokens, passwords, PIN digests) kept in audit_logs before/after with [redacted] (S1, 7 Nov 2026)"
  task redact: :environment do
    puts "#{AuditLog.redact_stored!} audit row(s) redacted"
  end
end

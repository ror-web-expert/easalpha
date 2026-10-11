# SPEC Audit Logs: every create, update and delete made through the admin panel, append-only. Included by Tenanted, so
# every business-owned model writes a row after commit with the attributes that changed. Caches, tokens and sync
# bookkeeping are left out; controllers keep writing the richer rows (void, refund, approve) themselves.
module Audited
  extend ActiveSupport::Concern

  SKIPPED_TABLES = %w[stock_levels push_subscriptions gl_accounts journal_entries journal_lines sync_batches sync_rejections notifications receipt_events deduction_audits settings
                      import_jobs user_permissions role_permissions support_sessions aggregator_events].freeze
  # Updates that only touch these are housekeeping, not something a person did.
  IGNORED_ATTRIBUTES = %w[updated_at created_at last_seen_at last_sync_at last_login_at pin_failed_count pin_locked_until
                          current_balance_minor balance_minor loyalty_points units_sold stock_deducted_at printed_at notified_at
                          preorder_notified_at app_version].freeze
  HIDDEN_ATTRIBUTES = %w[pin_digest password_digest token_digest otp_digest secret webhook_secret].freeze

  included do
    # The actor is read while the change is made (inside the transaction, where Tenancy::Context has set Current) and
    # used after commit; by commit time the context that made the change may already be gone.
    after_save :audit_remember_actor
    after_destroy :audit_remember_actor
    after_commit :audit_create, on: :create
    after_commit :audit_update, on: :update
    after_commit :audit_delete, on: :destroy
  end

  class_methods do
    def audited? = !SKIPPED_TABLES.include?(table_name)
  end

  private

  def audit_remember_actor
    @audit_actor = { user_id: Current.user_id, branch_id: Current.branch_id, device_id: Current.device&.id, ip: Current.ip }
  end

  def audit_create
    return unless self.class.audited?
    AuditLog.record_change(self, action: ledger_action || "create", after: audit_snapshot(attributes), actor: @audit_actor)
  end

  def audit_update
    return unless self.class.audited?
    changes = saved_changes.except(*IGNORED_ATTRIBUTES)
    return if changes.empty?
    before = changes.transform_values(&:first)
    after = changes.transform_values(&:last)
    AuditLog.record_change(self, action: update_action(changes), before: audit_snapshot(before), after: audit_snapshot(after), actor: @audit_actor)
  end

  def audit_delete
    return unless self.class.audited?
    AuditLog.record_change(self, action: "delete", before: audit_snapshot(attributes), actor: @audit_actor)
  end

  # SPEC action names: delete for an archive, cancel, receive and status_change for a status move.
  def update_action(changes)
    return "delete" if changes.key?("archived_at") && changes["archived_at"].last.present?
    if changes.key?("status")
      to = changes["status"].last.to_s
      return "cancel" if to.in?(%w[cancelled voided])
      return "receive" if to.in?(%w[received posted]) && self.class.table_name.in?(%w[goods_receipts purchase_orders stock_documents])
      return "status_change"
    end
    "update"
  end

  def ledger_action
    return nil unless self.class.table_name == "account_entries"
    direction = respond_to?(:direction) ? direction.to_s : nil
    amount = respond_to?(:amount_minor) ? amount_minor.to_i : 0
    (direction == "out" || amount.negative?) ? "ledger_credit" : "ledger_debit"
  end

  def audit_snapshot(h)
    h.to_h.except(*HIDDEN_ATTRIBUTES).transform_values { |v| v.respond_to?(:iso8601) ? v.iso8601 : v }
  end
end

class AuditLog < ApplicationRecord
  # Not Tenanted: platform events have no business. Queries always filter by business_id explicitly.
  # Every action the API writes, with the label the admin's Audit Logs filter shows: SPEC actions first, then the
  # EasAlpha extras. The filter lists exactly these (GET /audit_logs/entities), so a new action written anywhere
  # belongs here too; audit_actions_spec reads the code to keep the two together (review of 6 Nov 2026, R16).
  ACTION_LABELS = {
    "create" => "Create", "update" => "Update", "delete" => "Delete", "bulk_update" => "Bulk update", "bulk_delete" => "Bulk delete",
    "cancel" => "Cancel", "receive" => "Receive", "status_change" => "Status change", "ledger_debit" => "Ledger debit", "ledger_credit" => "Ledger credit",
    "void" => "Void", "refund" => "Refund", "discount" => "Discount", "price_change" => "Price change", "permission_change" => "Permission change",
    "login" => "Sign-in", "logout" => "Sign-out", "pin_login" => "PIN sign-in", "pin_failed" => "Wrong PIN", "export" => "Export",
    "settings_change" => "Settings change", "pair_device" => "Device paired", "revoke_device" => "Device removed", "approve" => "Manager approval",
    # Offline sales replayed by the server
    "client_time_clamped" => "Till clock corrected", "offline_payment_adjusted" => "Offline payment adjusted",
    "khata_over_limit_offline" => "Khata over limit (offline)", "khata_overdue_offline" => "Khata overdue (offline)",
    # Stock and purchasing
    "stock_post" => "Stock action posted", "stock_cancel" => "Stock action cancelled", "counting" => "Stock counting", "production" => "Production",
    "goods_receipt" => "Goods received", "goods_receipt_cancel" => "Goods receipt cancelled", "purchase_return" => "Purchase return",
    "po_send" => "Purchase order sent", "po_cancel" => "Purchase order cancelled", "supplier_payment" => "Supplier payment",
    "ledger_adjustment" => "Supplier ledger adjustment", "import" => "Import",
    # People, riders and the day
    "payroll_generate" => "Payroll generated", "payroll_pay" => "Payroll paid", "day_end_settlement" => "Day-end settlement",
    "checklist_complete" => "Checklist completed", "rider_float_issue" => "Rider float issued", "rider_float_return" => "Rider float returned",
    "rider_float_spend" => "Rider float spent", "rider_float_adjust" => "Rider float adjusted", "rider_settle" => "Rider settled",
    # Customers and guests
    "reverse" => "Account adjustment reversed", "loyalty_adjust" => "Loyalty points adjusted", "loyalty_redeem" => "Loyalty points redeemed",
    "campaign_send" => "Campaign sent", "qr_accept" => "QR order accepted", "qr_reject" => "QR order rejected",
    "reservation_confirmed" => "Reservation confirmed", "reservation_no_show" => "Reservation no-show",
    "reservation_cancelled" => "Reservation cancelled", "reservation_completed" => "Reservation completed"
  }.freeze
  ACTIONS = ACTION_LABELS.keys.freeze

  # Who acts now: the signed-in person, or EasAlpha support on an approved session, which works through the owner's
  # membership but is logged as itself (super_admin_id, no user; QA of 6 Nov 2026, P3).
  def self.current_actor
    support = Current.support_session&.super_admin_id
    { user_id: support ? nil : Current.user_id, super_admin_id: support, branch_id: Current.branch_id, device_id: Current.device&.id, ip: Current.ip }
  end

  # actor: who made the change, captured earlier by the Audited concern; defaults to the current request context.
  def self.record(action:, record: nil, before: nil, after: nil, business: Current.business, approved_by: nil, table_name: nil, record_id: nil, business_id: nil, actor: nil)
    actor ||= current_actor
    table_name ||= record&.class&.table_name
    record_id ||= record&.id
    # The Audited concern already wrote this create, update or delete in this request; keep the one richer row.
    return if action.to_s.in?(%w[create update delete]) && record_id && seen?(table_name, record_id, action)
    remember(table_name, record_id, action)
    create!(
      business_id: business_id || business&.id, branch_id: actor[:branch_id], user_id: actor[:user_id], device_id: actor[:device_id],
      super_admin_id: actor[:super_admin_id], approved_by_user_id: approved_by&.id, action: action.to_s,
      table_name: table_name, record_id: record_id,
      before: before, after: after, ip: actor[:ip], occurred_at: Time.current
    )
  end

  # Called by the Audited concern after a commit. Skips when a controller already wrote the same row.
  def self.record_change(model, action:, before: nil, after: nil, actor: nil)
    return if seen?(model.class.table_name, model.id, action)
    record(action: action, record: model, before: before, after: after, business_id: model.business_id, actor: actor)
  end

  def self.seen?(table, id, action) = (Current.audited || []).include?([ table.to_s, id.to_s, action.to_s ])
  def self.remember(table, id, action)
    return unless id
    (Current.audited ||= []) << [ table.to_s, id.to_s, action.to_s ]
  end

  def readonly? = persisted?
end

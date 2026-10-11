class AuditLog < ApplicationRecord
  # Not Tenanted: platform events have no business. Queries always filter by business_id explicitly.
  # SPEC actions first, then the EasAlpha extras the controllers write.
  ACTIONS = %w[create update delete bulk_update bulk_delete cancel receive status_change ledger_debit ledger_credit
               void refund discount price_change permission_change login logout pin_login pin_failed export settings_change
               pair_device revoke_device approve].freeze

  # actor: who made the change, captured earlier by the Audited concern; defaults to the current request context.
  def self.record(action:, record: nil, before: nil, after: nil, business: Current.business, approved_by: nil, table_name: nil, record_id: nil, business_id: nil, actor: nil)
    actor ||= { user_id: Current.user_id, branch_id: Current.branch_id, device_id: Current.device&.id, ip: Current.ip }
    table_name ||= record&.class&.table_name
    record_id ||= record&.id
    # The Audited concern already wrote this create, update or delete in this request; keep the one richer row.
    return if action.to_s.in?(%w[create update delete]) && record_id && seen?(table_name, record_id, action)
    remember(table_name, record_id, action)
    create!(
      business_id: business_id || business&.id, branch_id: actor[:branch_id], user_id: actor[:user_id], device_id: actor[:device_id],
      approved_by_user_id: approved_by&.id, action: action.to_s,
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

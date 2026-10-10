class AuditLog < ApplicationRecord
  # Not Tenanted: platform events have no business. Queries always filter by business_id explicitly.
  ACTIONS = %w[create update void refund discount price_change permission_change login logout pin_login pin_failed export settings_change pair_device revoke_device approve].freeze

  def self.record(action:, record: nil, before: nil, after: nil, business: Current.business, approved_by: nil, table_name: nil, record_id: nil)
    create!(
      business_id: business&.id, branch_id: Current.branch_id, user_id: Current.user_id, device_id: Current.device&.id,
      approved_by_user_id: approved_by&.id, action: action.to_s,
      table_name: table_name || record&.class&.table_name, record_id: record_id || record&.id,
      before: before, after: after, ip: Current.ip, occurred_at: Time.current
    )
  end
end

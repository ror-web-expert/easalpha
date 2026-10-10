# SPEC Regular discounts: recency tiers. If the customer's last order was within N days, take X off. The POS applies
# the best match automatically and the smallest day window wins; customers who never ordered get nothing.
class RegularDiscountTier < ApplicationRecord
  include Tenanted
  validates :name, presence: true
  validates :within_days, numericality: { greater_than: 0, only_integer: true }
  validates :kind, inclusion: { in: %w[percent fixed] }
  validates :value, numericality: { greater_than: 0 }
  scope :active, -> { where(active: true, archived_at: nil) }

  def excludes?(order)
    return true if excluded_order_types.include?(order.order_type)
    false
  end

  def discount_for(amount_minor)
    return 0 if amount_minor < min_order_minor
    kind == "percent" ? (amount_minor * value / 100).round : [ amount_minor, (value * 100).to_i ].min
  end
end

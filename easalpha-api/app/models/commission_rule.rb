# Commission for order takers, waiters, cashiers or riders: percent of sales, per order or per item.
class CommissionRule < ApplicationRecord
  include Tenanted
  APPLIES = %w[order_taker waiter cashier rider].freeze
  BASES = %w[percent_of_sales per_order per_item].freeze
  validates :name, presence: true
  validates :applies_to, inclusion: { in: APPLIES }
  validates :basis, inclusion: { in: BASES }
  validates :value, numericality: { greater_than_or_equal_to: 0 }
  scope :active, -> { where(active: true) }

  def matches?(membership)
    return false if membership_id.present? && membership_id != membership.id
    return false if role_key.present? && membership.role.system_key != role_key
    true
  end

  def amount_for(sales_minor:, orders:, items:)
    case basis
    when "percent_of_sales" then (BigDecimal(sales_minor.to_s) * value / 100).round
    when "per_order" then (value * 100 * orders).round
    when "per_item" then (value * 100 * items).round
    end
  end
end

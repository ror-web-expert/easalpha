# Labor, gas, rent and the like: never stock items. Allocated per order or per month into cost reports.
class Overhead < ApplicationRecord
  include Tenanted
  KINDS = %w[labor gas rent utilities other].freeze
  BASES = %w[per_order per_month per_day].freeze
  belongs_to :branch, optional: true
  validates :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :basis, inclusion: { in: BASES }
  validates :amount_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  scope :active, -> { where(active: true) }

  # Cost allocated to a period with the given number of orders and days.
  def allocate(orders:, days:)
    case basis
    when "per_order" then amount_minor * orders
    when "per_day" then amount_minor * days
    else (BigDecimal(amount_minor.to_s) * days / 30).round
    end
  end
end

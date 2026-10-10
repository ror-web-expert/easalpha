class Promotion < ApplicationRecord
  include Tenanted
  KINDS = %w[percent fixed happy_hour coupon].freeze
  APPLIES = %w[order category product].freeze
  validates :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :applies_to, inclusion: { in: APPLIES }
  validates :value, numericality: { greater_than: 0 }
  validates :coupon_code, presence: true, if: -> { kind == "coupon" }
  scope :active, -> { where(archived_at: nil, active: true) }
  before_validation { self.coupon_code = coupon_code.to_s.strip.upcase.presence }

  def sold_out? = unit_limit.present? && units_sold >= unit_limit

  def available_at?(time, zone: "Asia/Karachi")
    return false if sold_out?
    return false if valid_from && time < valid_from
    return false if valid_to && time > valid_to
    local = time.in_time_zone(zone)
    return false if days.any? && !days.include?(local.wday.zero? ? 7 : local.wday)
    if start_time && end_time
      hm = local.strftime("%H:%M")
      s, e = start_time.strftime("%H:%M"), end_time.strftime("%H:%M")
      return false unless s <= e ? (hm >= s && hm < e) : (hm >= s || hm < e)
    end
    true
  end

  # Discount in minor units for a line or order amount.
  def discount_for(amount_minor)
    return 0 if amount_minor < min_order_minor
    case kind
    when "percent", "happy_hour", "coupon" then (amount_minor * value / 100).round
    when "fixed" then [amount_minor, (value * 100).to_i].min
    else 0
    end
  end
end

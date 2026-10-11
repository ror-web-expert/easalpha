class Product < ApplicationRecord
  include Tenanted
  ORDER_TYPES = %w[dine_in takeaway delivery walk_in online].freeze
  DISCOUNT_TYPES = %w[percent amount].freeze
  has_many :order_type_consumables, dependent: :destroy
  has_many :quick_add_items, dependent: :destroy
  validates :discount_type, inclusion: { in: DISCOUNT_TYPES }
  validates :discount_value, numericality: { greater_than_or_equal_to: 0 }
  validates :discount_value, numericality: { less_than_or_equal_to: 100 }, if: -> { discount_type == "percent" }

  # SPEC product discount: a % of the line, or Rs per unit, taken before order-level discounts.
  def discount_minor_for(line_subtotal_minor, quantity)
    return 0 if discount_value.to_d <= 0
    amount = discount_type == "percent" ? (line_subtotal_minor * discount_value / 100) : (discount_value * 100 * quantity)
    [ amount.round, line_subtotal_minor ].min
  end
  belongs_to :category
  belongs_to :tax_rate, optional: true
  has_many :variants, -> { where(archived_at: nil).order(:sort_order) }, class_name: "ProductVariant", dependent: :destroy
  has_many :product_prices, dependent: :destroy
  has_many :product_modifier_groups, -> { order(:sort_order) }, dependent: :destroy
  has_many :modifier_groups, through: :product_modifier_groups
  validates :name, presence: true
  validates :base_price_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  validates :sku, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }, allow_nil: true
  scope :active, -> { where(archived_at: nil, active: true) }
  scope :live, -> { active.where(show_online: true) }
  before_validation { self.sku = sku.presence }

  # Price for an order type, variant and branch, falling back to the base price.
  def price_for(order_type:, variant: nil, branch_id: nil)
    candidates = product_prices.select { |p| p.variant_id == variant&.id && p.order_type == order_type.to_s }
    row = candidates.find { |p| p.branch_id == branch_id } || candidates.find { |p| p.branch_id.nil? }
    return row.price_minor if row
    variant ? variant.price_minor : base_price_minor
  end
end

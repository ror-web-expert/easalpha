class Product < ApplicationRecord
  include Tenanted
  ORDER_TYPES = %w[dine_in takeaway delivery walk_in online].freeze
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

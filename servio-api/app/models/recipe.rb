# A recipe per product (or variant), or a sub-recipe that produces a stock item in batches.
class Recipe < ApplicationRecord
  include Tenanted
  belongs_to :product, optional: true
  belongs_to :variant, class_name: "ProductVariant", optional: true
  belongs_to :yield_unit, class_name: "Unit", optional: true
  belongs_to :output_stock_item, class_name: "StockItem", optional: true
  belongs_to :source_section, class_name: "StockSection", optional: true
  has_many :lines, -> { order(:sort_order, :created_at) }, class_name: "RecipeLine", dependent: :destroy
  has_many :production_batches, dependent: :nullify
  validates :name, presence: true
  validates :yield_qty, numericality: { greater_than: 0 }
  validates :product_id, uniqueness: { scope: %i[business_id variant_id], conditions: -> { where(archived_at: nil) }, message: "already has a recipe; edit it instead" }, allow_nil: true
  validates :output_stock_item_id, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) }, message: "already has a recipe" }, allow_nil: true
  validate { errors.add(:base, "A recipe belongs to a product or produces a stock item, not both") if product_id && output_stock_item_id }
  validate { errors.add(:base, "A recipe needs a product or an output stock item") if product_id.nil? && output_stock_item_id.nil? }
  validate { errors.add(:yield_unit, "must match the output item's unit kind") if output_stock_item && yield_unit && yield_unit.kind != output_stock_item.base_unit.kind }
  scope :active, -> { where(archived_at: nil) }
  scope :for_products, -> { where.not(product_id: nil) }
  scope :sub_recipes, -> { where.not(output_stock_item_id: nil) }

  def sub_recipe? = output_stock_item_id.present?

  # Cost of one yield unit: for a product recipe with yield 1 this is the cost per portion.
  def unit_cost_minor = yield_qty.zero? ? 0 : (BigDecimal(cost_minor.to_s) / yield_qty).round

  # Base quantity of the output per yield unit (sub-recipes): yield in the output item's base unit.
  def yield_base_qty
    return yield_qty unless output_stock_item && yield_unit
    yield_unit.convert(yield_qty, to: output_stock_item.base_unit)
  end
end

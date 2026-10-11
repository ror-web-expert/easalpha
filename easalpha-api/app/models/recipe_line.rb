class RecipeLine < ApplicationRecord
  include Tenanted
  belongs_to :recipe
  belongs_to :stock_item
  belongs_to :unit
  validates :quantity, numericality: { greater_than: 0 }
  validates :waste_percent, numericality: { greater_than_or_equal_to: 0, less_than: 100 }
  validate { errors.add(:unit, "must be the same kind as the item's base unit") if unit && stock_item && unit.kind != stock_item.base_unit.kind }
  before_validation { self.base_quantity = unit.convert(quantity, to: stock_item.base_unit) if unit && stock_item && quantity }

  # Quantity actually consumed per yield including waste allowance.
  def gross_base_quantity = base_quantity * (1 + waste_percent / 100)
  def cost_minor = (gross_base_quantity * stock_item.avg_cost_minor_per_base).round
end

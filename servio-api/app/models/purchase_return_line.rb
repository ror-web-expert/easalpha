class PurchaseReturnLine < ApplicationRecord
  include Tenanted
  belongs_to :purchase_return
  belongs_to :stock_item
  belongs_to :unit
  validates :quantity, numericality: { greater_than: 0 }
  before_validation { self.base_quantity = unit.convert(quantity, to: stock_item.base_unit) if unit && stock_item && quantity }

  def line_total_minor = (BigDecimal(unit_cost_minor.to_s) * quantity).round
end

class GoodsReceiptLine < ApplicationRecord
  include Tenanted
  belongs_to :goods_receipt
  belongs_to :stock_item
  belongs_to :unit
  belongs_to :purchase_order_line, optional: true
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_cost_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  before_validation { self.base_quantity = unit.convert(quantity, to: stock_item.base_unit) if unit && stock_item && quantity }

  def line_total_minor = (BigDecimal(unit_cost_minor.to_s) * quantity).round
  def base_unit_cost = BigDecimal(unit_cost_minor.to_s) * stock_item.base_unit.factor_to_base / unit.factor_to_base
end

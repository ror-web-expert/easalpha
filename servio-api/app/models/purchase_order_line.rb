class PurchaseOrderLine < ApplicationRecord
  include Tenanted
  belongs_to :purchase_order
  belongs_to :stock_item
  belongs_to :unit
  validates :quantity, numericality: { greater_than: 0 }
  validate { errors.add(:unit, "must be the same kind as the item's base unit") if unit && stock_item && unit.kind != stock_item.base_unit.kind }
  before_validation { self.base_quantity = unit.convert(quantity, to: stock_item.base_unit) if unit && stock_item && quantity }

  def outstanding_base_qty = [base_quantity - received_base_qty, 0].max
end

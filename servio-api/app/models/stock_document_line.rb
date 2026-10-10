class StockDocumentLine < ApplicationRecord
  include Tenanted
  belongs_to :stock_document
  belongs_to :stock_item
  belongs_to :unit
  before_create { self.id ||= SecureRandom.uuid }
  validates :quantity, numericality: true
  validate { errors.add(:unit, "must be the same kind as the item's base unit") if unit && stock_item && unit.kind != stock_item.base_unit.kind }
  before_validation :compute_base_quantity

  # Cost per base unit in minor units (receipts enter cost per entered unit).
  def base_unit_cost
    return nil if unit_cost_minor.nil?
    BigDecimal(unit_cost_minor.to_s) * stock_item.base_unit.factor_to_base / unit.factor_to_base
  end

  private

  def compute_base_quantity
    return unless unit && stock_item
    q = stock_document&.kind == "count" ? (counted_qty || 0) : quantity
    self.base_quantity = unit.convert(q || 0, to: stock_item.base_unit)
  end
end

class StockItem < ApplicationRecord
  include Tenanted
  belongs_to :base_unit, class_name: "Unit"
  belongs_to :purchase_unit, class_name: "Unit", optional: true
  has_many :stock_levels, dependent: :destroy
  has_many :ledger_entries, class_name: "StockLedgerEntry"
  validates :name, presence: true
  validates :sku, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }, allow_nil: true
  validate { errors.add(:purchase_unit, "must be the same kind as the base unit") if purchase_unit && purchase_unit.kind != base_unit&.kind }
  before_validation { self.sku = sku.presence }
  scope :active, -> { where(archived_at: nil) }

  def total_quantity = stock_levels.sum(:quantity)
  def total_value_minor = stock_levels.sum(:value_minor)
  def below_minimum? = minimum_qty.positive? && total_quantity < minimum_qty
end

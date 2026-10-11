class StockItem < ApplicationRecord
  include Tenanted
  belongs_to :base_unit, class_name: "Unit"
  belongs_to :purchase_unit, class_name: "Unit", optional: true
  has_many :stock_levels, dependent: :destroy
  has_many :ledger_entries, class_name: "StockLedgerEntry"
  validates :name, presence: true
  validates :sku, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }, allow_nil: true
  validate { errors.add(:purchase_unit, "must be the same kind as the base unit") if purchase_unit && purchase_unit.kind != base_unit&.kind }
  before_validation { self.sku = sku.presence || generate_sku }
  scope :active, -> { where(archived_at: nil) }
  scope :selling, -> { active.where(active: true) }

  # SPEC auto SKU: first letters of the name, a category code, four digits, for example ADR-GE-9350.
  def generate_sku
    initials = name.to_s.split(/\s+/).map { |w| w[0] }.join.upcase.gsub(/[^A-Z]/, "")[0, 3].presence || "ITM"
    cat = category.to_s.upcase.gsub(/[^A-Z]/, "")[0, 2].presence || "GE"
    10.times do
      candidate = "#{initials}-#{cat}-#{format('%04d', rand(10_000))}"
      return candidate unless StockItem.unscoped.where(business_id: business_id || Current.business_id, sku: candidate).exists?
    end
    "#{initials}-#{cat}-#{SecureRandom.hex(2).upcase}"
  end

  def total_quantity = stock_levels.sum(:quantity)
  def total_value_minor = stock_levels.sum(:value_minor)
  def below_minimum? = minimum_qty.positive? && total_quantity < minimum_qty
end

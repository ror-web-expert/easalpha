class Unit < ApplicationRecord
  include Tenanted
  KINDS = %w[weight volume count].freeze
  DEFAULTS = [
    { code: "g", name: "Gram", kind: "weight", factor_to_base: 1, is_base: true },
    { code: "kg", name: "Kilogram", kind: "weight", factor_to_base: 1000 },
    { code: "ml", name: "Millilitre", kind: "volume", factor_to_base: 1, is_base: true },
    { code: "l", name: "Litre", kind: "volume", factor_to_base: 1000 },
    { code: "pcs", name: "Piece", kind: "count", factor_to_base: 1, is_base: true },
    { code: "dz", name: "Dozen", kind: "count", factor_to_base: 12 }
  ].freeze
  validates :code, :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :code, uniqueness: { scope: :business_id }
  validates :factor_to_base, numericality: { greater_than: 0 }
  scope :active, -> { where(archived_at: nil) }

  # Every business gets the standard units once; custom units (box, bag, crate) are added on top.
  def self.seed_defaults!
    DEFAULTS.each { |u| find_or_create_by!(code: u[:code]) { |x| x.assign_attributes(u) } }
  end

  # Quantity in `self` expressed in `to`: a stored conversion pair first (SPEC: each direction stored), else the base factors.
  def convert(quantity, to:)
    return BigDecimal(quantity.to_s) if id == to.id
    pair = UnitConversion.unscoped.find_by(from_unit_id: id, to_unit_id: to.id)
    return BigDecimal(quantity.to_s) * pair.factor if pair
    raise Api::Errors::Unprocessable.new("unit.kind", "Cannot convert #{code} to #{to.code}") unless kind == to.kind
    (BigDecimal(quantity.to_s) * factor_to_base / to.factor_to_base)
  end

  # Units a recipe or document line may use for an item: the same kind, plus any unit with a stored pair to the base unit.
  def self.compatible_with(base_unit)
    paired = UnitConversion.where(to_unit_id: base_unit.id).pluck(:from_unit_id)
    active.where(kind: base_unit.kind).or(active.where(id: paired))
  end
end

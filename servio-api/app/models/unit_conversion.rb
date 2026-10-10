# SPEC units: conversion factors stored in each direction separately (1 kg = 1000 g and 1 g = 0.001 kg), including
# custom pairs such as 1 Pet12 = 12 bottles. Unit#convert looks here first, then falls back to the base factors.
class UnitConversion < ApplicationRecord
  include Tenanted
  belongs_to :from_unit, class_name: "Unit"
  belongs_to :to_unit, class_name: "Unit"
  validates :factor, numericality: { greater_than: 0 }
  validates :to_unit_id, uniqueness: { scope: :from_unit_id }

  # Writes both directions at once.
  def self.set!(from:, to:, factor:)
    factor = BigDecimal(factor.to_s)
    transaction do
      a = find_or_initialize_by(from_unit_id: from.id, to_unit_id: to.id)
      a.update!(factor: factor)
      b = find_or_initialize_by(from_unit_id: to.id, to_unit_id: from.id)
      b.update!(factor: 1 / factor)
      [ a, b ]
    end
  end

  # Every default unit gets its conversions to and from its base unit.
  def self.seed_defaults!
    Unit.active.where(is_base: false).find_each do |u|
      base = Unit.active.find_by(kind: u.kind, is_base: true) or next
      set!(from: u, to: base, factor: u.factor_to_base) unless exists?(from_unit_id: u.id, to_unit_id: base.id)
    end
  end
end

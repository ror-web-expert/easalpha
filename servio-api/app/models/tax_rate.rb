class TaxRate < ApplicationRecord
  include Tenanted
  AUTHORITIES = %w[none fbr pra srb kpra bra vat].freeze
  validates :name, presence: true
  validates :rate, numericality: { greater_than_or_equal_to: 0, less_than: 100 }
  validates :authority, inclusion: { in: AUTHORITIES }
  scope :active, -> { where(active: true) }

  after_save { TaxRate.where.not(id: id).update_all(is_default: false) if is_default }

  # Tax on a price in minor units. Inclusive prices already contain the tax.
  def tax_on(amount_minor)
    r = rate.to_d / 100
    inclusive ? (amount_minor - (amount_minor / (1 + r))).round : (amount_minor * r).round
  end
end

# SPEC Supplier Ledger: a manual adjustment line. Positive means we owe the supplier more (a credit to the supplier),
# negative means we owe less.
class SupplierAdjustment < ApplicationRecord
  include Tenanted
  belongs_to :supplier
  validates :amount_minor, numericality: { only_integer: true, other_than: 0 }
  validates :reason, presence: true
end

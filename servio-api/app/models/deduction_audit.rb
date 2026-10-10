# One row per stock deduction attempt for an order, so the owner can see which sales moved stock and which could not.
class DeductionAudit < ApplicationRecord
  include Tenanted
  STATUSES = %w[ok missing partial reversed waste skipped error].freeze
  belongs_to :order
  validates :status, inclusion: { in: STATUSES }
end

# SPEC Loyalty: redemption options convert points back, as a fixed amount, a percent off or a free item.
class LoyaltyRedemptionOption < ApplicationRecord
  include Tenanted
  belongs_to :product, optional: true
  validates :name, presence: true
  validates :points, numericality: { greater_than: 0, only_integer: true }
  validates :kind, inclusion: { in: %w[fixed percent free_item] }
  validates :value, numericality: { greater_than_or_equal_to: 0 }
  scope :active, -> { where(active: true, archived_at: nil).order(:sort_order, :points) }
end

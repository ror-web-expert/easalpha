class DeliveryZone < ApplicationRecord
  include Tenanted
  belongs_to :branch
  validates :name, presence: true
  validates :charge_minor, :min_order_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  scope :active, -> { where(active: true, archived_at: nil) }

  # Matches an address area or city name against the zone's area list (case-insensitive).
  def covers?(text)
    t = text.to_s.downcase
    areas.any? { |a| t.include?(a.downcase) }
  end

  def self.for_address(branch_id:, text:)
    active.where(branch_id: branch_id).order(:charge_minor).find { |z| z.covers?(text) }
  end
end

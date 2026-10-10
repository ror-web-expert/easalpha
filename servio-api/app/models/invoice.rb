class Invoice < ApplicationRecord
  include Tenanted
  STATUSES = %w[open reported paid void].freeze
  belongs_to :subscription, optional: true
  validates :number, :amount_minor, :currency, :due_on, presence: true
  validates :status, inclusion: { in: STATUSES }
  before_validation { self.number ||= "INV-#{Time.current.strftime('%Y%m')}-#{SecureRandom.hex(3).upcase}" }
  scope :unpaid, -> { where(status: %w[open reported]) }
end

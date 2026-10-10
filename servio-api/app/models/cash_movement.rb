class CashMovement < ApplicationRecord
  include Tenanted
  KINDS = %w[cash_in cash_out payout float_issue float_return drop].freeze
  belongs_to :shift
  validates :kind, inclusion: { in: KINDS }
  validates :reason, presence: true
  validates :amount_minor, numericality: { only_integer: true }
  before_create { self.id ||= SecureRandom.uuid }
end

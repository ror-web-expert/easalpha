class RiderCashMovement < ApplicationRecord
  include Tenanted
  KINDS = %w[issue return spend adjust settle].freeze
  belongs_to :rider
  validates :kind, inclusion: { in: KINDS }
  validates :amount_minor, numericality: { only_integer: true }
  before_create { self.created_at ||= Time.current }
end

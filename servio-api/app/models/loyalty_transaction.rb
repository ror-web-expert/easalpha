class LoyaltyTransaction < ApplicationRecord
  include Tenanted
  KINDS = %w[earn redeem adjust expire refund].freeze
  belongs_to :customer
  belongs_to :order, optional: true
  validates :kind, inclusion: { in: KINDS }
  validates :points, numericality: { only_integer: true }
  before_create { self.created_at ||= Time.current }
end

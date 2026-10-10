class Subscription < ApplicationRecord
  include Tenanted
  belongs_to :plan
  STATUSES = %w[trialing active past_due grace read_only cancelled].freeze
  validates :status, inclusion: { in: STATUSES }
end

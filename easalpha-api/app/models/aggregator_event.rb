# One row per webhook event from an aggregator (Foodpanda), so retries never create a second order.
class AggregatorEvent < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  validates :provider, :external_id, :event, presence: true
end

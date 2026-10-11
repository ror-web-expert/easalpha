class PushSubscription < ApplicationRecord
  include Tenanted
  APPS = %w[admin pos kitchen rider].freeze
  belongs_to :membership
  validates :endpoint, :p256dh, :auth, presence: true
  validates :app, inclusion: { in: APPS }
end

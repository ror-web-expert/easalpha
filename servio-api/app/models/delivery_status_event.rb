class DeliveryStatusEvent < ApplicationRecord
  include Tenanted
  belongs_to :delivery
  before_create { self.created_at ||= Time.current }
end

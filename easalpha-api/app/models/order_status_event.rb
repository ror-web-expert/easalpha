class OrderStatusEvent < ApplicationRecord
  include Tenanted
  belongs_to :order
end

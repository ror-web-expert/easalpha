class OrderItemModifier < ApplicationRecord
  include Tenanted
  belongs_to :order_item
end

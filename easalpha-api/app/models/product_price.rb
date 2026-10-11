class ProductPrice < ApplicationRecord
  include Tenanted
  belongs_to :product
  validates :order_type, inclusion: { in: Product::ORDER_TYPES }
  validates :price_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
end

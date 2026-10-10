class ProductVariant < ApplicationRecord
  include Tenanted
  belongs_to :product
  validates :name, presence: true
  validates :price_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
end

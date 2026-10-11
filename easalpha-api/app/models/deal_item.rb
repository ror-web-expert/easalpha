class DealItem < ApplicationRecord
  include Tenanted
  belongs_to :deal
  belongs_to :product
  validates :quantity, numericality: { greater_than: 0, only_integer: true }
end

class CustomerPayment < ApplicationRecord
  include Tenanted
  belongs_to :customer
  belongs_to :payment_method, optional: true
  belongs_to :payment_account, optional: true
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  validates :direction, inclusion: { in: %w[received paid] }
  before_create { self.number ||= (CustomerPayment.unscoped.where(business_id: business_id).maximum(:number) || 0) + 1 }
end

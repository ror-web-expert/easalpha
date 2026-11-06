class CustomerPayment < ApplicationRecord
  include Tenanted
  belongs_to :customer
  belongs_to :payment_method, optional: true
  belongs_to :payment_account, optional: true
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  validates :direction, inclusion: { in: %w[received paid] }
  # From the business's counter: max + 1 under one customer's lock gave two customers paying at the same moment the
  # same number, and the business-wide unique index refused the second payment. It carries on from the numbers before.
  before_create do
    self.number ||= DocumentCounter.next!("customer_payment", business_id: business_id, after: CustomerPayment.unscoped.where(business_id: business_id).maximum(:number).to_i)
  end
end

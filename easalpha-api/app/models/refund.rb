class Refund < ApplicationRecord
  include Tenanted
  belongs_to :order
  belongs_to :payment_method
  belongs_to :payment_account, optional: true
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  validates :reason, presence: true
  before_create { self.id ||= SecureRandom.uuid }
end

class Payment < ApplicationRecord
  include Tenanted
  belongs_to :order
  belongs_to :received_by, class_name: "Membership", foreign_key: :received_by_membership_id, optional: true
  belongs_to :payment_method
  belongs_to :payment_account, optional: true
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  before_create { self.id ||= SecureRandom.uuid }
end

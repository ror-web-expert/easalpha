class SupplierPayment < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  belongs_to :supplier
  belongs_to :goods_receipt, optional: true
  belongs_to :payment_method, optional: true
  belongs_to :payment_account, optional: true
  validates :direction, inclusion: { in: %w[paid received] }
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }

  def label = "SP-#{number}"
  belongs_to :purchase_order, optional: true
end

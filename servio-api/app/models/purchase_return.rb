class PurchaseReturn < ApplicationRecord
  include Tenanted
  SETTLEMENTS = %w[credit_note cash_refund].freeze
  belongs_to :branch
  belongs_to :supplier
  belongs_to :goods_receipt, optional: true
  belongs_to :stock_document, optional: true
  belongs_to :stock_section, optional: true
  belongs_to :payment_method, optional: true
  belongs_to :payment_account, optional: true
  has_many :lines, class_name: "PurchaseReturnLine", dependent: :destroy
  validates :settlement, inclusion: { in: SETTLEMENTS }
  validates :status, inclusion: { in: %w[posted cancelled] }

  def label = "RET-#{number}"
end

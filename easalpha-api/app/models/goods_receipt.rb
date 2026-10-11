class GoodsReceipt < ApplicationRecord
  include Tenanted
  belongs_to :branch
  belongs_to :supplier
  belongs_to :purchase_order, optional: true
  belongs_to :stock_document, optional: true
  belongs_to :stock_section, optional: true
  has_many :lines, class_name: "GoodsReceiptLine", dependent: :destroy
  has_many :purchase_returns, dependent: :nullify
  validates :status, inclusion: { in: %w[posted cancelled] }

  def label = "GRN-#{number}"
  def posted? = status == "posted"
end

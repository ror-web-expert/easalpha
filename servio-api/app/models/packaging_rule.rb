class PackagingRule < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  belongs_to :stock_item
  validates :order_type, inclusion: { in: Product::ORDER_TYPES }
  validates :quantity, numericality: { greater_than: 0 }

  def self.for(branch_id:, order_type:)
    rows = where(order_type: order_type).where("branch_id = ? OR branch_id IS NULL", branch_id).includes(:stock_item).to_a
    branch_rows = rows.select { |r| r.branch_id == branch_id }
    branch_rows.any? ? branch_rows : rows
  end
end

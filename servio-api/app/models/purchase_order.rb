class PurchaseOrder < ApplicationRecord
  include Tenanted
  STATUSES = %w[draft sent partial received cancelled].freeze
  belongs_to :branch
  belongs_to :supplier
  has_many :lines, -> { order(:sort_order, :created_at) }, class_name: "PurchaseOrderLine", dependent: :destroy
  has_many :goods_receipts, dependent: :nullify
  validates :status, inclusion: { in: STATUSES }

  def label = "PO-#{number}"
  def draft? = status == "draft"
  def open? = status.in?(%w[sent partial])
  def recompute_total! = update_columns(total_minor: lines.sum { |l| (BigDecimal(l.unit_cost_minor.to_s) * l.quantity).round })

  def refresh_status!
    return unless status.in?(%w[sent partial received])
    all = lines.all? { |l| l.received_base_qty >= l.base_quantity }
    any = lines.any? { |l| l.received_base_qty.positive? }
    update!(status: all ? "received" : (any ? "partial" : "sent"), received_at: all ? (received_at || Time.current) : nil)
  end
end

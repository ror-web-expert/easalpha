class Order < ApplicationRecord
  include Tenanted
  ORDER_TYPES = %w[dine_in takeaway delivery walk_in].freeze
  SOURCES = %w[till qr online app phone foodpanda kiosk].freeze
  STATUSES = %w[draft held placed preparing ready served dispatched paid closed voided refunded].freeze
  OPEN_STATUSES = %w[draft held placed preparing ready served dispatched].freeze
  KITCHEN_STATUSES = %w[placed preparing ready].freeze

  belongs_to :branch
  belongs_to :device, optional: true
  belongs_to :dining_table, class_name: "DiningTable", foreign_key: :table_id, optional: true
  belongs_to :customer, optional: true
  belongs_to :shift, optional: true
  belongs_to :address, class_name: "CustomerAddress", optional: true
  has_many :items, -> { order(:sort_order, :created_at) }, class_name: "OrderItem", dependent: :destroy
  has_many :status_events, -> { order(:occurred_at) }, class_name: "OrderStatusEvent", dependent: :destroy
  has_many :story_events, -> { order(:occurred_at) }, class_name: "OrderEvent", dependent: :destroy
  has_many :discounts, class_name: "DiscountApplied", dependent: :destroy
  has_many :voids, dependent: :destroy
  has_many :kitchen_tickets, dependent: :destroy
  has_many :payments, dependent: :destroy
  has_many :refunds, dependent: :destroy

  before_create { self.id ||= SecureRandom.uuid }
  validates :order_type, inclusion: { in: ORDER_TYPES }
  validates :source, inclusion: { in: SOURCES }
  validates :status, inclusion: { in: STATUSES }
  validates :staff_meal_reason, presence: true, if: :is_staff_meal

  scope :open, -> { where(status: OPEN_STATUSES) }
  scope :on_day, ->(day) { where(business_day: day) }
  scope :in_kitchen, -> { where(status: KITCHEN_STATUSES) }
  # Pre-orders stay off the kitchen screen until two hours before they are due.
  scope :due_in_kitchen, -> { where("scheduled_for IS NULL OR scheduled_for <= ?", 2.hours.from_now) }
  scope :preorders, -> { where.not(scheduled_for: nil) }

  def open? = OPEN_STATUSES.include?(status)
  def sent? = placed_at.present?
  def preorder? = scheduled_for.present?
  def paid? = payment_status == "paid"
  def editable? = status.in?(%w[draft held placed preparing ready served])
  def active_items = items.reject { |i| i.status == "cancelled" }
  def due_minor = [total_minor - paid_minor, 0].max
  def label = serial ? "##{serial}" : (till_serial || "draft")
  def completed? = status.in?(%w[paid closed])
  def reopened? = reopened_at.present?
  # True when the order was reopened after its last payment, so it must go through the payment screen again (SPEC).
  def reopened_since_payment?
    return false unless reopened_at
    last = payments.where(status: "captured").maximum(:created_at)
    last.nil? || reopened_at > last
  end
  def spec_status = Orders::SpecStatus.of(self)
  def spec_payment_status = Orders::SpecStatus.payment_of(self)
end

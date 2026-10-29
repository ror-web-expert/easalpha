class OrderItem < ApplicationRecord
  include Tenanted
  STATUSES = %w[pending sent preparing ready served cancelled].freeze
  belongs_to :order
  belongs_to :product, optional: true
  belongs_to :variant, class_name: "ProductVariant", optional: true
  belongs_to :deal, optional: true
  has_many :modifiers, class_name: "OrderItemModifier", dependent: :destroy
  before_create { self.id ||= SecureRandom.uuid }
  validates :name_snapshot, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :quantity, numericality: { greater_than: 0 }
  validates :unit_price_minor, numericality: { greater_than_or_equal_to: 0 }

  def cancelled? = status == "cancelled"
  def gross_unit_minor = unit_price_minor + modifiers_minor
end

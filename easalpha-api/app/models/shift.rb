class Shift < ApplicationRecord
  include Tenanted
  STATUSES = %w[open closed force_closed].freeze
  belongs_to :branch
  belongs_to :device, optional: true
  belongs_to :drawer_account, class_name: "PaymentAccount", optional: true
  has_many :cash_movements, dependent: :destroy
  has_many :orders
  has_many :payments
  validates :status, inclusion: { in: STATUSES }
  validates :opening_cash_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  before_create { self.id ||= SecureRandom.uuid }
  scope :open, -> { where(status: "open") }

  def open? = status == "open"

  # Expected cash = opening + cash payments - cash refunds + cash in - cash out, all from the ledger rows of this shift.
  def expected_cash
    cash_in = Payment.where(shift_id: id, status: "captured", method_code: "cash").sum(:amount_minor)
    change = Payment.where(shift_id: id, status: "captured", method_code: "cash").sum(:change_minor)
    cash_refunds = Refund.joins(:payment_method).where(shift_id: id, payment_methods: { kind: "cash" }).sum(:amount_minor)
    khata_cash = CustomerPayment.joins(:payment_method).where(shift_id: id, direction: "received", payment_methods: { kind: "cash" }).sum(:amount_minor)
    khata_paid = CustomerPayment.joins(:payment_method).where(shift_id: id, direction: "paid", payment_methods: { kind: "cash" }).sum(:amount_minor)
    movements = cash_movements.sum(:amount_minor)
    opening_cash_minor + cash_in - cash_refunds + khata_cash - khata_paid + movements
  end
end

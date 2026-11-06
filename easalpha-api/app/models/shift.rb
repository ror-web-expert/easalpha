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

  # Expected cash is what the drawer account's ledger says this shift put in and took out: the opening float, cash
  # sales, refunds, khata collections and payouts, cash in and out, and the expenses, supplier payments, supplier
  # refunds and advances that leave the drawer without a cash movement. Every kind lands in a row of the breakdown.
  def expected_cash = cash_breakdown[:expected_minor]

  CASH_ROWS = { "order_payment" => :cash_sales_minor, "refund" => :cash_refunds_minor, "customer_payment" => :khata_collected_minor, "customer_refund" => :khata_paid_out_minor,
                "deposit" => :cash_in_minor, "withdrawal" => :cash_out_minor, "expense" => :expenses_minor, "opening" => :opening_minor }.freeze
  OUTGOING = %i[cash_refunds_minor khata_paid_out_minor cash_out_minor expenses_minor supplier_payments_minor].freeze

  def cash_breakdown
    rows = { opening_minor: opening_cash_minor, cash_sales_minor: 0, cash_refunds_minor: 0, khata_collected_minor: 0, khata_paid_out_minor: 0, cash_in_minor: 0, cash_out_minor: 0,
             expenses_minor: 0, supplier_payments_minor: 0, supplier_refunds_minor: 0, other_minor: 0 }
    return rows.merge(expected_minor: legacy_expected_cash) if drawer_account_id.nil?
    by_kind = AccountEntry.where(payment_account_id: drawer_account_id, shift_id: id).group(:kind).sum(:amount_minor)
    posted_opening = false
    by_kind.each do |kind, amount|
      case kind
      when "opening" then posted_opening = true
      when "supplier_payment"
        # Paid to a supplier is money out; a supplier's refund (positive) is money in. Both can happen in one shift.
        rows[:supplier_payments_minor] += -AccountEntry.where(payment_account_id: drawer_account_id, shift_id: id, kind: kind).where("amount_minor < 0").sum(:amount_minor)
        rows[:supplier_refunds_minor] += AccountEntry.where(payment_account_id: drawer_account_id, shift_id: id, kind: kind).where("amount_minor > 0").sum(:amount_minor)
      when *CASH_ROWS.keys then rows[CASH_ROWS[kind]] += OUTGOING.include?(CASH_ROWS[kind]) ? -amount : amount
      else rows[:other_minor] += amount
      end
    end
    # A shift opened with no float posts no opening row; the figure comes from the shift either way.
    rows[:expected_minor] = (posted_opening ? 0 : opening_cash_minor) + by_kind.values.sum
    rows
  end

  # Shifts from before every cashier had a drawer account: the old sum of their rows, every cash-kind method counted.
  def legacy_expected_cash
    cash_in = Payment.by_method_kind("cash").where(shift_id: id, status: "captured").sum(:amount_minor)
    cash_refunds = Refund.by_method_kind("cash").where(shift_id: id).sum(:amount_minor)
    khata_cash = CustomerPayment.by_method_kind("cash").where(shift_id: id, direction: "received").sum(:amount_minor)
    khata_paid = CustomerPayment.by_method_kind("cash").where(shift_id: id, direction: "paid").sum(:amount_minor)
    opening_cash_minor + cash_in - cash_refunds + khata_cash - khata_paid + cash_movements.sum(:amount_minor)
  end
end

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

  # The shift whose drawer takes the cash moved at a till: the member's own shift open on that till, else the shift
  # open on it, else the member's own open shift at the branch (the admin panel, or a till with no shift). A manager
  # refunding, or a second cashier selling, at a cashier's till moves that till's cash, so it lands in that shift's
  # expected cash and Z report (QA T4 and B1), not in the manager's own shift or in company cash.
  def self.for_till(device:, membership:, branch: nil)
    return nil unless membership
    if device
      here = open.where(device_id: device.id).order(opened_at: :desc).to_a
      found = here.find { |s| s.cashier_membership_id == membership.id } || here.first
      return found if found
    end
    own = open.where(cashier_membership_id: membership.id)
    own = own.where(branch_id: branch.id) if branch
    own.first
  end

  # Expected cash is what the drawer account's ledger says this shift put in and took out: the opening float, cash
  # sales, refunds, khata collections and payouts, cash in and out, drops, payouts, and the expenses, supplier
  # payments, supplier refunds and advances that leave the drawer without a cash movement. Every kind lands in a row
  # of the breakdown, so the rows add up to Expected on the Z report.
  def expected_cash = cash_breakdown[:expected_minor]

  CASH_ROWS = { "order_payment" => :cash_sales_minor, "refund" => :cash_refunds_minor, "customer_payment" => :khata_collected_minor, "customer_refund" => :khata_paid_out_minor,
                "deposit" => :cash_in_minor, "expense" => :expenses_minor, "rider_float" => :rider_float_minor, "opening" => :opening_minor }.freeze
  OUTGOING = %i[cash_refunds_minor khata_paid_out_minor cash_out_minor drops_minor payouts_minor expenses_minor supplier_payments_minor].freeze

  # The drawer rows of this shift's own money. The count and the hand-over (the over or short, the float back to the
  # safe, the settlement) reference the shift itself, as the opening float does, and come after Expected.
  def takings_entries
    AccountEntry.where(payment_account_id: drawer_account_id, shift_id: id).where.not("COALESCE(account_entries.ref_table, '') = 'shifts' AND account_entries.kind <> 'opening'")
  end

  # What this shift still holds in its drawer account: its takings, then whatever the count and the hand-over moved.
  def drawer_balance
    return 0 if drawer_account_id.nil?
    AccountEntry.where(payment_account_id: drawer_account_id, shift_id: id).sum(:amount_minor)
  end

  def cash_breakdown
    rows = { opening_minor: opening_cash_minor, cash_sales_minor: 0, cash_refunds_minor: 0, khata_collected_minor: 0, khata_paid_out_minor: 0, cash_in_minor: 0, cash_out_minor: 0,
             drops_minor: 0, payouts_minor: 0, expenses_minor: 0, supplier_payments_minor: 0, supplier_refunds_minor: 0, rider_float_minor: 0, other_minor: 0 }
    return rows.merge(expected_minor: legacy_expected_cash) if drawer_account_id.nil?
    scope = takings_entries
    by_kind = scope.group(:kind).sum(:amount_minor)
    by_kind.each do |kind, amount|
      case kind
      when "opening", "withdrawal" then next # the float is the shift's own figure; withdrawals are split below
      when "supplier_payment"
        # Paid to a supplier is money out; a supplier's refund (positive) is money in. Both can happen in one shift.
        rows[:supplier_payments_minor] += -scope.where(kind: kind).where("amount_minor < 0").sum(:amount_minor)
        rows[:supplier_refunds_minor] += scope.where(kind: kind).where("amount_minor > 0").sum(:amount_minor)
      when *CASH_ROWS.keys then rows[CASH_ROWS[kind]] += OUTGOING.include?(CASH_ROWS[kind]) ? -amount : amount
      else rows[:other_minor] += amount
      end
    end
    # A withdrawal is a drop to the safe, a payout recorded before 7 Nov 2026, or a cash out, by its movement.
    by_movement = scope.where(kind: "withdrawal", ref_table: "cash_movements").joins("JOIN cash_movements ON cash_movements.id = account_entries.ref_id").group("cash_movements.kind").sum(:amount_minor)
    rows[:drops_minor] = -by_movement["drop"].to_i
    rows[:payouts_minor] = -by_movement["payout"].to_i
    rows[:cash_out_minor] = -(by_kind["withdrawal"].to_i - by_movement["drop"].to_i - by_movement["payout"].to_i)
    # A payout is an expense paid through the till's Payout: its expense rows (and their void) sit on their own row.
    payout_expenses = AccountEntry.where(id: cash_movements.where(kind: "payout").select(:account_entry_id), ref_table: "expenses").select(:ref_id)
    paid_out = -scope.where(kind: "expense", ref_table: "expenses", ref_id: payout_expenses).sum(:amount_minor)
    rows[:payouts_minor] += paid_out
    rows[:expenses_minor] -= paid_out
    # A shift opened with no float posts no opening row; the figure comes from the shift either way.
    rows[:expected_minor] = (by_kind.key?("opening") ? 0 : opening_cash_minor) + by_kind.values.sum
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

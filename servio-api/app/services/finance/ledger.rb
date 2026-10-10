module Finance
  # The combined money ledger by business day, reconciled against paid orders, with an integrity check (decision 6: P&L and exports, not a full GL).
  module Ledger
    module_function

    def day(branch:, day:)
      entries = AccountEntry.where(branch_id: branch.id, business_day: day).includes(:payment_account).order(:occurred_at)
      accounts = PaymentAccount.where(id: entries.map(&:payment_account_id).uniq).index_by(&:id)
      rows = entries.map do |e|
        { id: e.id, occurred_at: e.occurred_at, account_id: e.payment_account_id, account: accounts[e.payment_account_id]&.name, account_kind: accounts[e.payment_account_id]&.kind, kind: e.kind,
          amount_minor: e.amount_minor, description: e.description, ref_table: e.ref_table, ref_id: e.ref_id, by_membership_id: e.by_membership_id, shift_id: e.shift_id, reversed: e.reversed_by_entry_id.present? }
      end
      by_kind = entries.reorder(nil).group(:kind).sum(:amount_minor)
      by_account = entries.reorder(nil).group(:payment_account_id).sum(:amount_minor).map { |id, v| { account_id: id, account: accounts[id]&.name, kind: accounts[id]&.kind, net_minor: v } }
      { business_day: day, rows: rows, by_kind: by_kind, by_account: by_account, in_minor: entries.where("amount_minor > 0").sum(:amount_minor), out_minor: entries.where("amount_minor < 0").sum(:amount_minor) }
    end

    # Paid orders versus what the account ledger recorded for the day, by payment method and in total.
    def reconciliation(branch:, day:)
      payments = Payment.where(branch_id: branch.id, business_day: day, status: "captured")
      by_method = payments.group(:method_code).sum(:amount_minor)
      posted = AccountEntry.where(branch_id: branch.id, business_day: day, kind: "order_payment").sum(:amount_minor)
      refunds = Refund.where(branch_id: branch.id, business_day: day).sum(:amount_minor)
      posted_refunds = -AccountEntry.where(branch_id: branch.id, business_day: day, kind: "refund").sum(:amount_minor)
      khata = by_method["khata"] || 0
      expected = payments.sum(:amount_minor) - khata
      paid_orders = Order.where(branch_id: branch.id, business_day: day, status: %w[paid closed refunded])
      { business_day: day, paid_orders: paid_orders.count, sales_minor: paid_orders.sum(:total_minor), payments_minor: payments.sum(:amount_minor), by_method: by_method, khata_minor: khata,
        expected_posted_minor: expected, posted_minor: posted, difference_minor: posted - expected, refunds_minor: refunds, posted_refunds_minor: posted_refunds, refund_difference_minor: posted_refunds - refunds,
        balanced: (posted - expected).zero? && (posted_refunds - refunds).zero? }
    end

    # Integrity: every paid order fully paid, every captured payment posted once, no unreversed negative drawer, ledger rows never edited.
    def integrity(branch:, from:, to:)
      issues = []
      Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed]).find_each do |o|
        paid = Payment.where(order_id: o.id, status: "captured").sum(:amount_minor)
        issues << { kind: "order_underpaid", order_id: o.id, label: o.label, business_day: o.business_day, detail: "paid #{paid} of #{o.total_minor}" } if paid < o.total_minor
      end
      Payment.joins(:payment_method).where(branch_id: branch.id, business_day: from..to, status: "captured").where.not(payment_methods: { kind: "khata" }).find_each do |p|
        n = AccountEntry.where(ref_table: "payments", ref_id: p.id, kind: "order_payment").count
        issues << { kind: n.zero? ? "payment_not_posted" : "payment_posted_twice", payment_id: p.id, order_id: p.order_id, business_day: p.business_day, detail: "#{n} ledger rows" } if n != 1
      end
      PaymentAccount.where(kind: "drawer").find_each do |a|
        issues << { kind: "drawer_negative", account_id: a.id, detail: "#{a.name} at #{a.current_balance_minor}" } if a.current_balance_minor.negative?
      end
      AccountEntry.where(branch_id: branch.id, business_day: from..to).find_each do |e|
        issues << { kind: "entry_edited", entry_id: e.id, detail: "updated after creation" } if e.updated_at > e.created_at + 2.seconds && e.reversed_by_entry_id.nil? && e.verified_at.nil?
      end
      { from: from, to: to, ok: issues.empty?, issues: issues, checked_at: Time.current }
    end
  end
end

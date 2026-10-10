module Reports
  # SPEC Cashier Till: orders taken and money collected are different measures and do not reconcile. An order rung up
  # by one cashier and paid to another counts once for each; only Collected is a figure someone is accountable for.
  # In tills now runs all-time until a Day-End Settlement clears it, so an unsettled till shows more than the period.
  module CashierTill
    module_function

    def run(branch:, from:, to:)
      orders = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded])
      payments = Payment.where(branch_id: branch.id, business_day: from..to, status: "captured")
      taken = orders.group(:taken_by_membership_id).pluck(Arel.sql("taken_by_membership_id, count(*), sum(total_minor)")).to_h { |m, c, t| [ m, { orders: c, amount_minor: t.to_i } ] }
      collected = payments.group(:received_by_membership_id).pluck(Arel.sql("received_by_membership_id, count(*), sum(amount_minor)")).to_h { |m, c, t| [ m, { payments: c, amount_minor: t.to_i } ] }
      by_method = payments.group(:received_by_membership_id, :method_code).sum(:amount_minor).each_with_object(Hash.new { |h, k| h[k] = {} }) { |((m, code), v), h| h[m][code] = v }
      drawers = PaymentAccount.active.where(kind: "drawer").where.not(cashier_membership_id: nil).group(:cashier_membership_id).sum(:current_balance_minor)
      shifts = Shift.where(branch_id: branch.id, business_day: from..to)
      settled = shifts.where(settlement_status: "settled").group(:cashier_membership_id).count
      unsettled = shifts.where(status: "closed", settlement_status: "pending").group(:cashier_membership_id).count
      open_shifts = shifts.where(status: "open").group(:cashier_membership_id).count
      ids = (taken.keys + collected.keys + drawers.keys).compact.uniq
      names = Membership.unscoped.includes(:user).where(id: ids).index_by(&:id)
      rows = ids.map do |mid|
        { membership_id: mid, name: names[mid]&.user&.name || "Unknown", orders_taken: taken.dig(mid, :orders) || 0, taken_minor: taken.dig(mid, :amount_minor) || 0,
          payments: collected.dig(mid, :payments) || 0, collected_minor: collected.dig(mid, :amount_minor) || 0, collected_by_method: by_method[mid] || {},
          in_tills_now_minor: drawers[mid] || 0, shifts_settled: settled[mid] || 0, shifts_unsettled: unsettled[mid] || 0, shifts_open: open_shifts[mid] || 0 }
      end.sort_by { |r| -r[:collected_minor] }
      { from: from, to: to, rows: rows,
        totals: { orders_taken: rows.sum { |r| r[:orders_taken] }, taken_minor: rows.sum { |r| r[:taken_minor] }, collected_minor: rows.sum { |r| r[:collected_minor] }, in_tills_now_minor: rows.sum { |r| r[:in_tills_now_minor] },
                  shifts_unsettled: rows.sum { |r| r[:shifts_unsettled] } },
        settlements: DayEndSettlement.where(branch_id: branch.id, business_day: from..to).order(business_day: :desc).map { |s| ShiftSerializers.day_end_settlement(s) },
        note: "Orders taken and money collected are different measures and do not reconcile. In tills now runs until a Day-End Settlement clears it." }
    end
  end
end

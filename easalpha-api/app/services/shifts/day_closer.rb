module Shifts
  # Day close: every shift closed, no open orders, then the day is locked. A manager can reopen with a reason.
  module DayCloser
    module_function

    def status(branch, day)
      shifts = Shift.where(branch_id: branch.id, business_day: day)
      open_orders = Order.where(branch_id: branch.id, business_day: day).open.where.not(status: %w[draft held])
      drafts = Order.where(branch_id: branch.id, business_day: day, status: %w[draft held])
      close = DayClose.find_by(branch_id: branch.id, business_day: day)
      {
        business_day: day, locked: close&.locked? || false, locked_at: close&.locked_at, reopened_at: close&.reopened_at,
        shifts: { total: shifts.count, open: shifts.open.count, unsettled: shifts.where(settlement_status: "pending").where.not(status: "open").count },
        open_orders: open_orders.count, drafts: drafts.count,
        ready: shifts.open.none? && open_orders.none?,
        summary: close&.summary.presence || summarise(branch, day)
      }
    end

    def lock!(branch, day, by:, force: false)
      st = status(branch, day)
      raise Api::Errors::Conflict.new("day.not_ready", "#{st[:shifts][:open]} open shift(s) and #{st[:open_orders]} open order(s) remain") unless st[:ready] || force
      close = DayClose.find_or_initialize_by(branch_id: branch.id, business_day: day)
      raise Api::Errors::Conflict.new("day.locked", "Day is already locked") if close.locked?
      Shift.transaction do
        Shift.open.where(branch_id: branch.id, business_day: day).find_each { |s| Manager.close!(s, counted_cash_minor: s.expected_cash, by: by, force: true, note: "Force-closed at day close") } if force
        Order.where(branch_id: branch.id, business_day: day, status: "draft").find_each { |o| Orders::Transitions.void!(o, reason: "Unsent at day close", actor: by, approver: by) } if force
        close.update!(locked_at: Time.current, locked_by_membership_id: by.id, reopened_at: nil, reopened_by_membership_id: nil, reopen_reason: nil, summary: summarise(branch, day))
        AuditLog.record(action: "update", record: close, after: { locked: true, force: force })
      end
      close
    end

    def reopen!(branch, day, by:, reason:)
      close = DayClose.find_by!(branch_id: branch.id, business_day: day)
      raise Api::Errors::BadRequest.new("day.reason", "A reason is required to reopen a day") if reason.blank?
      close.update!(reopened_at: Time.current, reopened_by_membership_id: by.id, reopen_reason: reason)
      AuditLog.record(action: "update", record: close, after: { reopened: true, reason: reason })
      close
    end

    def summarise(branch, day)
      orders = Order.where(branch_id: branch.id, business_day: day)
      paid = orders.where(status: %w[paid closed refunded])
      payments = Payment.where(branch_id: branch.id, business_day: day, status: "captured")
      {
        orders: orders.count, paid: paid.count, voided: orders.where(status: "voided").count,
        net_sales_minor: paid.sum(:total_minor), discount_minor: paid.sum(:discount_minor), tax_minor: paid.sum(:tax_minor),
        by_payment_method: payments.group(:method_code).sum(:amount_minor), refunds_minor: Refund.where(branch_id: branch.id, business_day: day).sum(:amount_minor),
        shifts: Shift.where(branch_id: branch.id, business_day: day).map { |s| { id: s.id, cashier_membership_id: s.cashier_membership_id, over_short_minor: s.over_short_minor, status: s.status } }
      }
    end
  end
end

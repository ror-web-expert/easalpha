module Shifts
  # Open, close and force-close shifts. A closed shift carries its Z report; cash is counted blind.
  module Manager
    module_function

    def open!(cashier:, branch:, device: nil, opening_cash_minor: 0, id: nil, client_created_at: nil)
      raise Api::Errors::Conflict.new("day.locked", "This business day is locked") if DayClose.locked?(branch.id, branch.business_day_for(Time.current))
      if id && (existing = Shift.find_by(id: id))
        return existing
      end
      raise Api::Errors::Conflict.new("shift.already_open", "#{cashier.user.name} already has an open shift") if Shift.open.exists?(cashier_membership_id: cashier.id)
      day = branch.business_day_for(client_created_at || Time.current)
      shift = nil
      Shift.transaction do
        drawer = drawer_account_for(cashier, branch)
        shift = Shift.create!(id: id, branch: branch, device: device, cashier_membership_id: cashier.id, drawer_account: drawer, business_day: day, opened_at: Time.current,
                              opening_cash_minor: opening_cash_minor, client_created_at: client_created_at)
        drawer&.update!(shift_id: shift.id)
        drawer&.post!(kind: "opening", amount_minor: opening_cash_minor, business_day: day, ref: shift, description: "Opening cash", by: cashier, shift_id: shift.id, branch_id: branch.id) if opening_cash_minor.positive?
        AuditLog.record(action: "create", record: shift, after: { opening_cash_minor: opening_cash_minor })
      end
      shift
    end

    # Blind close: the cashier sends the counted cash without seeing the expected figure.
    def close!(shift, counted_cash_minor:, count_detail: {}, by:, approver: nil, note: nil, force: false)
      raise Api::Errors::Conflict.new("shift.closed", "Shift is already closed") unless shift.open?
      open_orders = Order.open.where(shift_id: shift.id).where.not(status: %w[draft held])
      raise Api::Errors::Conflict.new("shift.open_orders", "#{open_orders.count} order(s) are still open. Pay, void or hand them over first.") if open_orders.exists? && !force
      Shift.transaction do
        expected = shift.expected_cash
        over_short = counted_cash_minor - expected
        shift.update!(status: force ? "force_closed" : "closed", closed_at: Time.current, expected_cash_minor: expected, counted_cash_minor: counted_cash_minor,
                      over_short_minor: over_short, count_detail: count_detail, approved_by_membership_id: approver&.id, close_note: note, z_report: ZReport.build(shift))
        shift.drawer_account&.update!(shift_id: nil)
        Order.where(shift_id: shift.id, status: %w[draft held]).find_each { |o| Orders::Transitions.change!(o, "held", actor: by, device: nil, reason: "shift closed") if o.status == "draft" }
        AuditLog.record(action: "update", record: shift, after: { closed: true, expected_cash_minor: expected, counted_cash_minor: counted_cash_minor, over_short_minor: over_short, force: force }, approved_by: approver&.user)
      end
      alert_if_short!(shift)
      shift
    end

    def settle!(shift, by:)
      raise Api::Errors::Conflict.new("shift.open", "Close the shift before settling") if shift.open?
      Shift.transaction do
        drawer = shift.drawer_account
        if drawer && drawer.current_balance_minor != 0
          company_cash = PaymentAccount.active.company.find_by(kind: "cash", is_default: true) || PaymentAccount.active.company.find_by(kind: "cash")
          amount = drawer.current_balance_minor
          drawer.post!(kind: "transfer_out", amount_minor: -amount, business_day: shift.business_day, ref: shift, description: "Settlement to #{company_cash&.name || 'cash'}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
          company_cash&.post!(kind: "transfer_in", amount_minor: amount, business_day: shift.business_day, ref: shift, description: "Settlement from #{drawer.name}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
        end
        shift.update!(settlement_status: "settled")
        AuditLog.record(action: "update", record: shift, after: { settled: true })
      end
      shift
    end

    def cash_movement!(shift, kind:, amount_minor:, reason:, by:, approver: nil, reference: nil, id: nil)
      raise Api::Errors::Conflict.new("shift.closed", "Shift is closed") unless shift.open?
      raise Api::Errors::BadRequest.new("cash.amount", "Amount must be positive") unless amount_minor.positive?
      raise Api::Errors::BadRequest.new("cash.reason", "A reason is required") if reason.blank?
      return CashMovement.find(id) if id && CashMovement.exists?(id: id)
      signed = kind.in?(%w[cash_in float_issue]) ? amount_minor : -amount_minor
      mv = nil
      Shift.transaction do
        mv = CashMovement.create!(id: id, shift: shift, kind: kind, amount_minor: signed, reason: reason, reference: reference, by_membership_id: by.id, approved_by_membership_id: approver&.id, occurred_at: Time.current)
        entry = shift.drawer_account&.post!(kind: signed.positive? ? "deposit" : "withdrawal", amount_minor: signed, business_day: shift.business_day, ref: mv, description: "#{kind.humanize}: #{reason}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
        mv.update!(account_entry_id: entry.id) if entry
        AuditLog.record(action: "create", record: mv, after: { kind: kind, amount_minor: signed, reason: reason }, approved_by: approver&.user)
      end
      mv
    end

    # A drawer account per cashier, created on first use. Its balance is the cash in that cashier's hands.
    def drawer_account_for(cashier, branch)
      PaymentAccount.active.find_by(kind: "drawer", cashier_membership_id: cashier.id) ||
        PaymentAccount.create!(name: "Drawer: #{cashier.user.name}", kind: "drawer", cashier_membership_id: cashier.id, branch_id: branch.id)
    end

    def alert_if_short!(shift)
      threshold = (shift.business.setting("cash_short_alert_minor") || 50_000).to_i
      return unless shift.over_short_minor && shift.over_short_minor.abs >= threshold
      Notification.create!(kind: "cash_short", title: "Cash #{shift.over_short_minor.negative? ? 'short' : 'over'} on shift close",
                           body: "#{Membership.unscoped.find_by(id: shift.cashier_membership_id)&.user&.name}: #{shift.over_short_minor / 100} on #{shift.business_day}", link: "/money/shifts/#{shift.id}")
      owner = Membership.active.joins(:role).where(roles: { system_key: "owner" }).first
      Whatsapp::Sender.deliver(phone: owner&.user&.phone, template: "alert_cash_short", variables: { amount: shift.over_short_minor / 100, day: shift.business_day.to_s }) if owner&.user&.phone
    end
  end
end

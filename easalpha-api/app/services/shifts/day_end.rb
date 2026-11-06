module Shifts
  # SPEC Day-End Settlement: settle every closed, unsettled shift of a business day in one go.
  module DayEnd
    module_function

    def settle!(branch:, day:, by:, note: nil, force: false)
      open = Shift.where(branch_id: branch.id, business_day: ..day, status: "open")
      raise Api::Errors::Conflict.new("day_end.open_shifts", "#{open.count} till(s) are still open; close them first or force") if open.exists? && !force
      # A force-closed shift is settled like any other closed one; Day close counts it as unsettled until then.
      pending = Shift.where(branch_id: branch.id, business_day: ..day, status: %w[closed force_closed], settlement_status: "pending").order(:closed_at).to_a
      names = Membership.unscoped.where(id: pending.map(&:cashier_membership_id)).includes(:user).to_h { |m| [ m.id, m.user&.name ] }
      detail = []
      amount = 0
      DayEndSettlement.transaction do
        pending.each do |s|
          # Each shift's own count, not whatever its cashier's drawer holds when its turn comes (QA B6: the first of two
          # shifts got both shifts' money and the second none).
          r = Shifts::Manager.settle_shift!(s, by: by)
          amount += r[:moved_minor]
          detail << { shift_id: s.id, cashier_membership_id: s.cashier_membership_id, cashier: names[s.cashier_membership_id], business_day: s.business_day,
                      expected_minor: s.expected_cash_minor, counted_minor: s.counted_cash_minor, over_short_minor: s.over_short_minor, float_to_safe_minor: r[:float_minor], amount_minor: r[:moved_minor] }
        end
        rec = DayEndSettlement.create!(branch: branch, business_day: day, settled_by_membership_id: by&.id, shifts_count: pending.size, amount_minor: amount, detail: { shifts: detail, forced: force }, note: note)
        AuditLog.record(action: "day_end_settlement", record: rec, after: { business_day: day, shifts: pending.size, amount_minor: amount })
        rec
      end
    end

    # SPEC My Till: the cashier's own till, what it holds and what was collected today.
    def my_till(membership, branch:)
      shift = Shift.open.find_by(cashier_membership_id: membership.id)
      drawer = PaymentAccount.active.find_by(kind: "drawer", cashier_membership_id: membership.id)
      day = branch.business_day_for(Time.current)
      pays = Payment.where(branch_id: branch.id, business_day: day, status: "captured", received_by_membership_id: membership.id)
      { shift: shift && ShiftSerializers.shift(shift), drawer_balance_minor: drawer&.current_balance_minor || 0, business_day: day,
        collected_today_minor: pays.sum(:amount_minor), payments_today: pays.count, by_method: pays.group(:method_code).sum(:amount_minor),
        orders_taken_today: Order.where(branch_id: branch.id, business_day: day, taken_by_membership_id: membership.id).where.not(status: "voided").count,
        unsettled_shifts: Shift.where(cashier_membership_id: membership.id, status: "closed", settlement_status: "pending").count,
        last_settlement: DayEndSettlement.where(branch_id: branch.id).order(created_at: :desc).first&.then { |s| ShiftSerializers.day_end_settlement(s) } }
    end
  end
end

module Shifts
  # Open, close and settle shifts, and the cash moved in and out of a drawer. A closed shift carries its Z report;
  # cash is counted blind.
  module Manager
    module_function

    MOVEMENT_KINDS = %w[cash_in cash_out payout drop float_issue float_return].freeze

    def open!(cashier:, branch:, device: nil, opening_cash_minor: 0, id: nil, client_created_at: nil)
      today = branch.business_day_for(Time.current)
      raise Api::Errors::Conflict.new("day.locked", "This business day is locked") if DayClose.locked?(branch.id, today)
      if id && (existing = Shift.find_by(id: id))
        return existing
      end
      raise Api::Errors::Conflict.new("shift.already_open", "#{cashier.user.name} already has an open shift") if Shift.open.exists?(cashier_membership_id: cashier.id)
      opened = Orders::ClientTime.clamp(client_created_at, table_name: "shifts", record_id: id) if client_created_at.present?
      day = branch.business_day_for(opened || Time.current)
      # Opened offline on a day that was locked before the till synced: the shift goes on today, so neither its sales
      # nor its close are refused for a locked day (review ledger#2).
      day = today if day != today && DayClose.locked?(branch.id, day)
      shift = nil
      Shift.transaction do
        drawer = drawer_account_for(cashier, branch)
        shift = Shift.create!(id: id, branch: branch, device: device, cashier_membership_id: cashier.id, drawer_account: drawer, business_day: day, opened_at: Time.current,
                              opening_cash_minor: opening_cash_minor, client_created_at: client_created_at)
        drawer&.update!(shift_id: shift.id)
        # The float comes out of the branch's safe, not out of nowhere as new owner's capital every shift (QA B3).
        Safe.issue!(shift: shift, amount_minor: opening_cash_minor, entry_kind: "opening", ref: shift, description: "Opening cash", by: cashier, day: day) if drawer && opening_cash_minor.positive?
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
        shift.lock!
        raise Api::Errors::Conflict.new("shift.closed", "Shift is already closed") unless shift.open?
        expected = shift.expected_cash
        over_short = counted_cash_minor - expected
        shift.assign_attributes(status: force ? "force_closed" : "closed", closed_at: Time.current, expected_cash_minor: expected, counted_cash_minor: counted_cash_minor,
                                over_short_minor: over_short, count_detail: count_detail, approved_by_membership_id: approver&.id, close_note: note)
        # Built once the count is on the shift, so the stored Z report carries Counted and Over/Short (QA T7, review reports#7).
        shift.z_report = ZReport.build(shift)
        shift.save!
        hand_over!(shift, by: by)
        shift.drawer_account&.update!(shift_id: nil)
        Order.where(shift_id: shift.id, status: %w[draft held]).find_each { |o| Orders::Transitions.change!(o, "held", actor: by, device: nil, reason: "shift closed") if o.status == "draft" }
        AuditLog.record(action: "update", record: shift, after: { closed: true, expected_cash_minor: expected, counted_cash_minor: counted_cash_minor, over_short_minor: over_short, force: force }, approved_by: approver&.user)
      end
      alert_if_short!(shift)
      shift
    end

    # After the count the drawer must hold what was counted: the difference goes to Cash Over and Short (QA B6), and
    # the float, with any cash in, goes back to the safe it came from, so the next float is not new money and the
    # settlement moves only the takings (QA B3). Run again at the settlement it posts only what moved since: a void
    # after the count, or a shift counted before 7 Nov 2026, which gets both here.
    def hand_over!(shift, by:)
      return if shift.drawer_account_id.nil? || shift.counted_cash_minor.nil?
      day = shift.branch.business_day_for(Time.current)
      diff = shift.counted_cash_minor - Safe.returned(shift).sum(:amount_minor) - shift.drawer_balance
      post_over_short!(shift, diff, by: by, day: day) unless diff.zero?
      return if Safe.returned(shift).exists?
      back = [ shift.opening_cash_minor + shift.cash_movements.where(kind: "cash_in").sum(:amount_minor), shift.drawer_balance ].min
      Safe.receive!(shift: shift, amount_minor: back, entry_kind: "transfer_out", ref: shift, description: "Float back to the safe", by: by, day: day) if back.positive?
    end

    def post_over_short!(shift, diff, by:, day:)
      drawer = shift.drawer_account
      entry = drawer.post!(kind: "adjustment", amount_minor: diff, business_day: day, ref: shift, description: diff.negative? ? "Short at the count" : "Over at the count", by: by,
                           shift_id: shift.id, branch_id: shift.branch_id, skip_journal: true)
      mirror = Finance::Chart.for_payment_account(drawer)
      lines = diff.negative? ? [ { account: Finance::Journal::OVER_SHORT, debit_minor: -diff }, { account: mirror, credit_minor: -diff } ] : [ { account: mirror, debit_minor: diff }, { account: Finance::Journal::OVER_SHORT, credit_minor: diff } ]
      Finance::Journal.post!(business_day: day, lines: lines, description: "#{drawer.name}: #{entry.description.downcase}", ref: entry, actor: by, branch_id: shift.branch_id)
    end

    def settle!(shift, by:) = settle_shift!(shift, by: by)[:shift]

    # Moves what this shift still holds (the counted cash less the float back in the safe) to company cash: its own
    # rows on the drawer, never the whole drawer, which also holds the cashier's other shifts (QA B6).
    def settle_shift!(shift, by:)
      raise Api::Errors::Conflict.new("shift.open", "Close the shift before settling") if shift.open?
      moved = 0
      Shift.transaction do
        shift.lock!
        raise Api::Errors::Conflict.new("shift.settled", "This shift is already settled") if shift.settlement_status == "settled"
        drawer = shift.drawer_account&.lock!
        hand_over!(shift, by: by)
        held = drawer ? shift.drawer_balance : 0
        if held != 0
          company_cash = PaymentAccount.active.where(kind: "cash").find_by(is_default: true) || PaymentAccount.active.find_by(kind: "cash")
          raise Api::Errors::Conflict.new("settle.no_cash_account", "Add a cash account on Payment Accounts to settle tills into") unless company_cash
          day = shift.branch.business_day_for(Time.current)
          drawer.post!(kind: "transfer_out", amount_minor: -held, business_day: day, ref: shift, description: "Settlement to #{company_cash.name}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
          company_cash.post!(kind: "transfer_in", amount_minor: held, business_day: day, ref: shift, description: "Settlement from #{drawer.name}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
          Finance::Journal.transfer!(from: drawer, to: company_cash, amount_minor: held, business_day: day, actor: by, note: "till settlement", ref: shift)
          moved = held
        end
        shift.update!(settlement_status: "settled")
        AuditLog.record(action: "update", record: shift, after: { settled: true, moved_minor: moved })
      end
      { shift: shift, moved_minor: moved, float_minor: Safe.returned(shift).sum(:amount_minor) }
    end

    # The shift's own cashier, a manager, or whoever is signed in on the till the shift is open on: it is that till's
    # drawer (a second cashier, or a manager standing in).
    def may_move?(shift, member:, device: nil)
      shift.cashier_membership_id == member.id || member.can?("shifts.any") || (device.present? && shift.device_id == device.id)
    end

    # Money out of a drawer follows the cash.in_out permission and its limit on the role (rupees; none set means no
    # limit), as a discount follows discounts.apply: above the limit, or without the permission, a manager's PIN
    # approves it (QA B7: a drop or cash out never asked). Cash in needs only the permission; a manager is never asked.
    def movement_needs_approval?(member, kind, amount_minor)
      return false if member.can?("shifts.any")
      return true unless member.can?("cash.in_out")
      return false if kind.in?(%w[cash_in float_issue])
      limit = member.limit_for("cash.in_out")
      limit.present? && amount_minor > limit.to_d * 100
    end

    # kind: cash_in (into the drawer, from the safe as far as it holds), drop (to the safe), payout (an expense paid from
    # the drawer: an Expense with its category, on the Expenses page and in the P&L), cash_out (taken out for the owner).
    def cash_movement!(shift, kind:, amount_minor:, reason:, by:, approver: nil, reference: nil, id: nil, category_id: nil, paid_to: nil)
      raise Api::Errors::Conflict.new("shift.closed", "Shift is closed") unless shift.open?
      raise Api::Errors::BadRequest.new("cash.amount", "Amount must be positive") unless amount_minor.positive?
      raise Api::Errors::BadRequest.new("cash.reason", "A reason is required") if reason.blank?
      return CashMovement.find(id) if id && CashMovement.exists?(id: id)
      raise Api::Errors::BadRequest.new("cash.kind", "kind must be cash_in, cash_out, payout or drop") unless kind.in?(MOVEMENT_KINDS)
      raise Api::Errors.approval_required([ "shifts.any" ], "A manager must approve this #{kind.humanize.downcase}") if approver.nil? && movement_needs_approval?(by, kind, amount_minor)
      day = shift.branch.business_day_for(Time.current) # the day the money moves, not the shift's opening day (review ledger#2)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if DayClose.locked?(shift.branch_id, day)
      signed = kind.in?(%w[cash_in float_issue]) ? amount_minor : -amount_minor
      mv = nil
      Shift.transaction do
        mv = CashMovement.create!(id: id, shift: shift, kind: kind, amount_minor: signed, reason: reason, reference: reference, by_membership_id: by.id, approved_by_membership_id: approver&.id, occurred_at: Time.current)
        drawer = shift.drawer_account
        entry = case kind
        when "cash_in" then drawer && Safe.issue!(shift: shift, amount_minor: amount_minor, entry_kind: "deposit", ref: mv, description: "Cash in: #{reason}", by: by, day: day)
        when "drop" then drawer && Safe.receive!(shift: shift, amount_minor: amount_minor, entry_kind: "withdrawal", ref: mv, description: "Drop to the safe: #{reason}", by: by, day: day)
        when "payout" then payout!(shift, mv, amount_minor: amount_minor, reason: reason, by: by, approver: approver, category_id: category_id, paid_to: paid_to)
        else drawer&.post!(kind: signed.positive? ? "deposit" : "withdrawal", amount_minor: signed, business_day: day, ref: mv, description: "#{kind.humanize}: #{reason}", by: by, shift_id: shift.id, branch_id: shift.branch_id)
        end
        mv.update!(account_entry_id: entry.id) if entry
        AuditLog.record(action: "create", record: mv, after: { kind: kind, amount_minor: signed, reason: reason }, approved_by: approver&.user)
      end
      mv
    end

    # A payout is an expense paid from this drawer, so it is on the Expenses page and in the P&L under its category
    # (Petty cash unless the till chose one), and the drawer row is the expense's own.
    def payout!(shift, mv, amount_minor:, reason:, by:, approver:, category_id:, paid_to:)
      category = category_id.present? ? ExpenseCategory.active.find(category_id) : payout_category
      e = Expenses::Recorder.create!({ category_id: category.id, amount_minor: amount_minor, paid_to: paid_to.presence, note: reason, approved_by_id: approver&.id },
                                     actor: by, branch: shift.branch, shift: shift, source: "till")
      mv.update!(reference: mv.reference.presence || e.label)
      AccountEntry.find_by(ref_table: "expenses", ref_id: e.id, kind: "expense")
    end

    def payout_category
      ExpenseCategory.seed_defaults! unless ExpenseCategory.exists?
      ExpenseCategory.active.find_by(name: "Petty cash", parent_id: nil) || ExpenseCategory.active.where(parent_id: nil).order(:sort_order).first
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

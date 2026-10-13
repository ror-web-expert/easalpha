module Payroll
  # Daily and weekly wages: employees whose pay frequency is daily or weekly are paid per day or per week instead of in
  # the monthly payroll run. Days worked come from attendance when the employee keeps it (present or late 1, half day
  # 0.5; a day without a row counts as the payroll run would record it), otherwise every day of the period counts; the
  # manager can change the days and the amount before paying. A payment is a Wages expense from the drawer or an
  # account, can recover outstanding advances, and messages the employee.
  module Wages
    module_function

    DAILY_PAID = { "present" => 1, "late" => 1, "half_day" => 0.5 }.freeze
    WEEKLY_PAID = DAILY_PAID.merge("weekly_off" => 1, "holiday" => 1, "leave" => 1).freeze

    # The suggested wage for an employee and period. Read only: it never writes attendance rows.
    def preview(employee, from:, to:)
      raise Api::Errors::Conflict.new("wages.monthly", "#{employee.name} is paid monthly; use Run Payroll") if employee.monthly?
      raise Api::Errors::BadRequest.new("wages.period", "The end date is before the start date") if to < from
      period_days = (to - from).to_i + 1
      # Kept or not is decided per employee, so a day without a scan is not mistaken for attendance not being kept. For
      # someone who keeps none, the only rows are ones a payroll run filled in; they are ignored and every day counts.
      tracked = Attendance.kept?(employee, from: from, to: to)
      attendance = tracked ? attendance_days(employee, from: from, to: to) : []
      # A daily wage pays the days worked; a weekly wage also pays the weekly off, holidays and approved leave, except
      # approved unpaid leave (the monthly run deducts it too), whether or not a payroll run recorded the day.
      paid_status = employee.pay_frequency == "daily" ? DAILY_PAID : WEEKLY_PAID
      unpaid = tracked ? LeaveRequest.where(employee_id: employee.id, status: "approved", kind: "unpaid").where("from_date <= ? AND to_date >= ?", to, from).to_a : []
      days = if tracked
        attendance.sum { |a| a[:status] == "leave" && unpaid.any? { |l| l.covers?(a[:day]) } ? 0 : paid_status.fetch(a[:status], 0) }
      else
        (from..to).count { |d| employee.active_on?(d) }
      end
      days = BigDecimal(days.to_s)
      rate = employee.base_salary_minor
      gross = wage_for(employee, days)
      outstanding = Advance.where(employee_id: employee.id, status: "paid").where("outstanding_minor > 0").sum(:outstanding_minor)
      paid = WagePayment.where(employee_id: employee.id, status: "paid").where("period_from <= ? AND period_to >= ?", to, from).order(:period_from).to_a
      { employee_id: employee.id, employee_name: employee.name, pay_frequency: employee.pay_frequency, from: from, to: to, period_days: period_days, attendance_tracked: tracked,
        attendance: attendance, days_worked: days.to_f, rate_minor: rate, gross_minor: gross,
        advances_outstanding_minor: outstanding, already_paid: paid.map { |w| serialize(w) }, phone: employee.phone }
    end

    # Each day of the period as attendance sees it: the day's row, else what fill_absences! would record (recorded false).
    # A working day after today has not happened yet and is left out; a weekly off, holiday or leave ahead still counts.
    def attendance_days(employee, from:, to:)
      rows = ::Attendance.where(employee_id: employee.id, business_day: from..to).index_by(&:business_day)
      today = Attendance.branch_for(employee).business_day_for(Time.current)
      cal = Attendance.calendar(employee, from: from, to: to)
      (from..to).filter_map do |d|
        if (a = rows[d]) then { day: d, status: a.status, recorded: true }
        elsif employee.active_on?(d) && (status = Attendance.status_without_row(d, **cal)) && (d <= today || status != "absent")
          { day: d, status: status, recorded: false }
        end
      end
    end

    def pay!(employee, from:, to:, actor:, branch:, shift: nil, days_worked: nil, gross_minor: nil, bonus_minor: 0, deductions_minor: 0, advance_recovery_minor: 0, method_code: "cash", note: nil)
      BusinessModules.require!(employee.business, "payroll")
      p = preview(employee, from: from, to: to)
      raise Api::Errors::Conflict.new("wages.already_paid", "#{employee.name} was already paid for #{from}#{from == to ? '' : " to #{to}"}") if p[:already_paid].any? { |w| w[:period_from] == from && w[:period_to] == to }
      raise Api::Errors::Conflict.new("wages.overlap", "#{employee.name} already has a wage paid inside this period") if p[:already_paid].any?
      days = days_worked.nil? ? BigDecimal(p[:days_worked].to_s) : BigDecimal(days_worked.to_s)
      raise Api::Errors::BadRequest.new("wages.days", "Days worked must be between 0 and #{p[:period_days]}") if days.negative? || days > p[:period_days]
      gross = gross_minor.nil? ? (days_worked.nil? ? p[:gross_minor] : wage_for(employee, days)) : gross_minor.to_i
      bonus = bonus_minor.to_i
      deductions = deductions_minor.to_i
      recover = advance_recovery_minor.to_i
      raise Api::Errors::BadRequest.new("wages.amount", "Amounts cannot be negative") if [ gross, bonus, deductions, recover ].any?(&:negative?)
      raise Api::Errors::BadRequest.new("wages.recovery", "Only Rs #{p[:advances_outstanding_minor] / 100} of advances is outstanding") if recover > p[:advances_outstanding_minor]
      net = gross + bonus - deductions - recover
      raise Api::Errors::BadRequest.new("wages.net", "The wage after deductions is below zero") if net.negative?
      wp = nil
      WagePayment.transaction do
        expense = nil
        if net.positive?
          expense = Expenses::Recorder.create!({ category_id: wages_category.id, amount_minor: net, method_code: method_code, paid_to: employee.name,
                                                 note: [ "Wage #{from}#{from == to ? '' : " to #{to}"}", note.presence ].compact.join(": "), spent_on: to.to_s }, actor: actor, branch: branch, shift: shift, source: "payroll_sync")
        end
        wp = WagePayment.create!(employee: employee, branch_id: branch.id, number: DocumentCounter.next!("wage_payment"), period_from: from, period_to: to, days_worked: days, rate_minor: employee.base_salary_minor,
                                 gross_minor: gross, bonus_minor: bonus, deductions_minor: deductions, advance_recovered_minor: recover, net_minor: net, method_code: method_code,
                                 payment_account_id: expense&.payment_account_id, expense_id: expense&.id, shift_id: shift&.id, note: note, status: "paid", by_membership_id: actor&.id, paid_at: Time.current)
        recover_advances!(employee, recover)
        AuditLog.record(action: "create", record: wp, after: { employee: employee.name, period: "#{from}..#{to}", days: days.to_f, gross_minor: gross, bonus_minor: bonus, deductions_minor: deductions, advance_recovered_minor: recover, net_minor: net })
      end
      Payroll::Notify.wage_paid!(wp)
      wp
    end

    # Voiding reverses the expense and gives back the advance recovered; the row stays with the reason.
    def void!(wp, reason:, actor:)
      WagePayment.transaction do
        wp.lock! # a second click must not give the advance back twice
        raise Api::Errors::Conflict.new("wages.voided", "#{wp.label} is already voided") unless wp.paid?
        raise Api::Errors::BadRequest.new("wages.reason", "A reason is required") if reason.to_s.strip.blank?
        # The expense may already be voided from the Expenses screen (before that was refused); the wage still voids.
        expense = wp.expense_id && Expense.find_by(id: wp.expense_id)
        expense_was_voided = expense&.voided? || false
        Expenses::Recorder.void!(expense, actor: actor, reason: "Wage #{wp.label} voided: #{reason}") if expense && !expense_was_voided
        restore_advances!(wp.employee, wp.advance_recovered_minor)
        wp.update!(status: "voided", voided_at: Time.current, void_reason: reason.to_s.strip)
        AuditLog.record(action: "void", record: wp, after: { reason: reason, net_minor: wp.net_minor, expense_already_voided: expense_was_voided })
      end
      wp
    end

    # Daily and weekly employees with what is due for a day (daily) or the week holding it (weekly), for Pay wages.
    def due(day:)
      Employee.active.where(pay_frequency: %w[daily weekly]).order(:name).select { |e| e.active_on?(day) }.map do |e|
        from, to = e.pay_frequency == "daily" ? [ day, day ] : [ day.beginning_of_week, day.end_of_week ]
        preview(e, from: from, to: to).merge(paid: WagePayment.where(employee_id: e.id, status: "paid", period_from: from, period_to: to).first&.then { |w| serialize(w) })
      end
    end

    def wage_for(employee, days)
      rate = BigDecimal(employee.base_salary_minor.to_s)
      (employee.pay_frequency == "daily" ? rate * days : rate * days / 7).round
    end

    def wages_category
      salaries = ExpenseCategory.active.find_by(name: "Salaries", parent_id: nil) || ExpenseCategory.create!(name: "Salaries")
      ExpenseCategory.active.find_by(name: "Wages") || ExpenseCategory.create!(name: "Wages", parent_id: salaries.id)
    end

    def recover_advances!(employee, amount)
      left = amount
      Advance.where(employee_id: employee.id, status: "paid").where("outstanding_minor > 0").order(:requested_on, :number).each do |a|
        break if left <= 0
        take = [ left, a.outstanding_minor ].min
        a.update!(outstanding_minor: a.outstanding_minor - take, status: a.outstanding_minor - take <= 0 ? "repaid" : "paid")
        left -= take
      end
    end

    def restore_advances!(employee, amount)
      left = amount
      Advance.where(employee_id: employee.id, status: %w[paid repaid]).order(requested_on: :desc, number: :desc).each do |a|
        break if left <= 0
        room = a.amount_minor - a.outstanding_minor
        give = [ left, room ].min
        next if give <= 0
        a.update!(outstanding_minor: a.outstanding_minor + give, status: "paid")
        left -= give
      end
    end

    def serialize(w)
      { id: w.id, number: w.number, label: w.label, employee_id: w.employee_id, employee_name: w.employee&.name, period_from: w.period_from, period_to: w.period_to, days_worked: w.days_worked.to_f,
        rate_minor: w.rate_minor, gross_minor: w.gross_minor, bonus_minor: w.bonus_minor, deductions_minor: w.deductions_minor, advance_recovered_minor: w.advance_recovered_minor,
        net_minor: w.net_minor, method_code: w.method_code, expense_id: w.expense_id, note: w.note, status: w.status, void_reason: w.void_reason, voided_at: w.voided_at,
        by_membership_id: w.by_membership_id, paid_at: w.paid_at }
    end
  end
end

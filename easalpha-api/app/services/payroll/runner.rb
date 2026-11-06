module Payroll
  # Generates a payroll run for a month: base pro-rated for joiners and leavers, components, absence deduction (calendar days or a fixed 26),
  # late fines, advance recovery, tips and commissions, then pays it as salary expenses.
  module Runner
    module_function

    # Runs that hold their payslips' reservations (advances, canteen) until paid or cancelled.
    LIVE = %w[generated approved].freeze

    def generate!(month:, actor:, branch: nil, notes: nil)
      month = month.beginning_of_month
      from, to = month, month.end_of_month
      Attendance.fill_absences!(from: from, to: [ to, Date.current ].min)
      defaults = AttendanceRule.find_by(employee_id: nil) || AttendanceRule.new
      # Daily and weekly employees are paid as wages (Payroll::Wages), not in the monthly run.
      employees = Employee.active.where(pay_frequency: "monthly").select { |e| e.active_on?(from) || e.active_on?(to) }
      employees = employees.select { |e| e.branch_id.nil? || e.branch_id == branch.id } if branch
      # One payslip per employee and month whatever the run's branch: a branch run and an all-branches run cannot both
      # pay the same person or recover the same advance. Anyone already on a live or paid run for the month is left
      # out; a run that would pay nobody because of that is the duplicate.
      on_a_run = Payslip.joins(:payroll_run).where(payroll_runs: { month: month }).where.not(payroll_runs: { status: "cancelled" }).where(employee_id: employees.map(&:id)).pluck(:employee_id).to_set
      employees = employees.reject { |e| on_a_run.include?(e.id) }
      raise Api::Errors::Conflict.new("payroll.exists", "Payroll for #{month.strftime('%B %Y')} already exists") if employees.empty? && on_a_run.any?
      # SPEC: the run snapshots the divisor, the fines and the allowances it used, so later rule changes never move a paid month.
      begin
        run = PayrollRun.create!(branch: branch, month: month, notes: notes, generated_by_membership_id: actor&.id,
                                 settings_snapshot: { salary_method: defaults.absent_rule, fixed_divisor: defaults.fixed_divisor, rules_enabled: defaults.rules_enabled, defaults: PayrollSerializers.rule(defaults) })
      rescue ActiveRecord::RecordNotUnique
        # A branch keeps one live run a month (a cancelled one does not count): someone who joined since is paid by
        # cancelling that run and generating it again.
        who = employees.size == 1 ? "the employee" : "the #{employees.size} employees"
        raise Api::Errors::Conflict.new("payroll.exists", "Payroll for #{month.strftime('%B %Y')} already exists for #{branch&.name}; cancel it and generate it again to include #{who} added since")
      end
      main_branch = branch || Branch.active.order(is_main: :desc).first
      commissions = Reports::Commissions.run(branch: main_branch, from: from, to: to)[:rows].group_by { |r| r[:membership_id] }
      # Tips are shared among the people who earned them: the run's branch when it has one, every branch otherwise.
      tips_scope = Order.where(business_day: from..to, status: %w[paid closed])
      tips_scope = tips_scope.where(branch_id: branch.id) if branch
      tips_total = tips_scope.sum(:tip_minor)
      tip_sharers = employees.select(&:shares_tips)
      canteen = Canteen::Payroll.enabled?
      deducted = canteen ? Canteen::Payroll.deducted_months : []
      employees.each do |e|
        rule = e.rule
        days_in_month = (to - from).to_i + 1
        active_days = (from..to).count { |d| e.active_on?(d) }
        base = (BigDecimal(e.base_salary_minor.to_s) * active_days / days_in_month).round
        att = Attendance.month_summary(e, month)
        divisor = rule.divisor(days_in_month)
        # Lost days come from the penalties (absent, half day or late set to lose the day), plus unpaid leave.
        absence_days = BigDecimal(att[:lost_days].to_s) + att[:unpaid_leave]
        absence = (BigDecimal(e.base_salary_minor.to_s) / divisor * absence_days).round
        overtime = rule.overtime_enabled ? (BigDecimal(att[:overtime_minutes].to_s) / 60 * rule.overtime_rate_minor_per_hour).round : 0
        comps = e.employee_salary_components.includes(:salary_component).map { |c| { name: c.salary_component.name, kind: c.salary_component.kind, amount_minor: c.amount_for(base) } }
        # Canteen: the month's meals, and any an earlier run missed, come off the salary; the payslip keeps their ids so
        # no other run takes them again, and pay! then settles the worker's account (Canteen::Payroll).
        if canteen
          meals = Canteen::Payroll.due(e, month: month, deducted: deducted)
          comps << { name: Canteen::Payroll.line_name(meals[:meals], meals[:carried]), kind: "deduction", amount_minor: meals[:amount_minor], canteen: true } if meals[:amount_minor].positive?
        end
        earnings = comps.select { |c| c[:kind] == "earning" }.sum { |c| c[:amount_minor] }
        deductions = comps.select { |c| c[:kind] == "deduction" }.sum { |c| c[:amount_minor] }
        commission = e.membership_id ? (commissions[e.membership_id] || []).sum { |r| r[:commission_minor] } : 0
        tips = tip_sharers.any? && e.shares_tips ? tips_total / tip_sharers.size : 0
        gross = base + earnings + commission + tips + overtime
        # An advance is recovered from what is still outstanding after what other live runs have already reserved
        # (reserved_advances); the amount taken here is this payslip's reservation until the run is paid or cancelled.
        advances = Advance.where(employee_id: e.id, status: "paid").where("outstanding_minor > 0").order(:requested_on)
        reserved = reserved_advances(e)
        recoverable = [ gross - deductions - absence - att[:fines_minor], 0 ].max
        recovered = 0
        adv_detail = advances.filter_map do |a|
          available = a.outstanding_minor - reserved[a.label]
          take = [ a.installment_minor || available, available, recoverable - recovered ].min
          next if take <= 0
          recovered += take
          { advance: a.label, taken_minor: take, outstanding_after_minor: available - take }
        end
        net = gross - deductions - absence - att[:fines_minor] - recovered
        Payslip.create!(payroll_run: run, employee: e, base_minor: base, earnings_minor: earnings + commission + tips + overtime, deductions_minor: deductions, absence_minor: absence, late_fines_minor: att[:fines_minor],
                        advances_recovered_minor: recovered, tips_minor: tips, commission_minor: commission, net_minor: net, days_present: att[:present], days_absent: att[:absent], days_leave: att[:leave],
                        detail: { components: comps, attendance: att, advances: adv_detail, active_days: active_days, days_in_month: days_in_month, absent_rule: rule.absent_rule, divisor: divisor,
                                  daily_rate_minor: (BigDecimal(e.base_salary_minor.to_s) / divisor).round, absence_days: absence_days.to_f, lost_days: att[:lost_days], overtime_minor: overtime,
                                  charges: att[:charges], rule: PayrollSerializers.rule(rule), canteen: canteen ? meals.slice(:claim_ids, :carried) : nil }.compact)
      end
      refresh_totals!(run)
      AuditLog.record(action: "payroll_generate", record: run, after: { month: month, employees: run.employees_count, net_minor: run.net_minor })
      run
    end

    # Advance amounts earmarked by payslips on live runs (generated or approved, not yet paid), by advance label. A
    # cancelled run releases them; a paid run has consumed them (pay! lowers outstanding_minor).
    def reserved_advances(employee)
      reserved = Hash.new(0)
      Payslip.joins(:payroll_run).where(employee_id: employee.id, payroll_runs: { status: LIVE }).pluck(:detail).each do |d|
        Array(d["advances"]).each { |ad| reserved[ad["advance"]] += ad["taken_minor"].to_i }
      end
      reserved
    end

    # Pays every payslip from an account as salary expenses (payroll sync), settles the canteen meals and closes the
    # advances recovered. The canteen line is read again from the live claims first (Canteen::Payroll.settle!), so a
    # meal cancelled since the run was generated is not taken and the net can only go up; an advance is consumed from
    # what was reserved and never below zero.
    def pay!(run, actor:, branch:, method_code: "cash")
      raise Api::Errors::Conflict.new("payroll.status", "Payroll is #{run.status}") unless run.status.in?(LIVE)
      category = ExpenseCategory.active.find_by(name: "Salaries") || ExpenseCategory.create!(name: "Salaries")
      PayrollRun.transaction do
        run.payslips.includes(:employee).each do |p|
          Canteen::Payroll.settle!(p, actor: actor, branch: branch) if Canteen::Payroll.enabled?
          if p.net_minor.positive?
            e = Expenses::Recorder.create!({ category_id: category.id, amount_minor: p.net_minor, method_code: method_code, paid_to: p.employee.name, note: "Salary #{run.label}", spent_on: Date.current.to_s }, actor: actor, branch: branch, source: "payroll_sync")
            p.update!(paid_at: Time.current, expense_id: e.id, payment_account_id: e.payment_account_id)
          else
            p.update!(paid_at: Time.current) # nothing to hand over, but the month is settled
          end
          Array(p.detail["advances"]).each do |ad|
            a = Advance.lock.find_by(employee_id: p.employee_id, number: ad["advance"].to_s.delete_prefix("ADV-").to_i) or next
            left = a.outstanding_minor - [ ad["taken_minor"].to_i, a.outstanding_minor ].min
            a.update!(outstanding_minor: left, status: left <= 0 ? "repaid" : "paid")
          end
        end
        refresh_totals!(run)
        run.update!(status: "paid", paid_at: Time.current, paid_by_membership_id: actor&.id)
        AuditLog.record(action: "payroll_pay", record: run, after: { net_minor: run.net_minor, method: method_code })
      end
      run.payslips.includes(:employee).each { |p| Payroll::Notify.salary_paid!(p, run) if p.paid_at && p.net_minor.positive? }
      run
    end

    def refresh_totals!(run)
      run.update!(employees_count: run.payslips.count, gross_minor: run.payslips.sum(:base_minor) + run.payslips.sum(:earnings_minor),
                  deductions_minor: run.payslips.sum("deductions_minor + absence_minor + late_fines_minor + advances_recovered_minor"), net_minor: run.payslips.sum(:net_minor))
    end
  end
end

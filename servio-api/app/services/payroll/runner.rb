module Payroll
  # Generates a payroll run for a month: base pro-rated for joiners and leavers, components, absence deduction (calendar days or a fixed 26),
  # late fines, advance recovery, tips and commissions, then pays it as salary expenses.
  module Runner
    module_function

    def generate!(month:, actor:, branch: nil, notes: nil)
      month = month.beginning_of_month
      raise Api::Errors::Conflict.new("payroll.exists", "Payroll for #{month.strftime('%B %Y')} already exists") if PayrollRun.where(branch_id: branch&.id, month: month).where.not(status: "cancelled").exists?
      from, to = month, month.end_of_month
      Attendance.fill_absences!(from: from, to: [to, Date.current].min)
      defaults = AttendanceRule.find_by(employee_id: nil) || AttendanceRule.new
      # SPEC: the run snapshots the divisor, the fines and the allowances it used, so later rule changes never move a paid month.
      run = PayrollRun.create!(branch: branch, month: month, notes: notes, generated_by_membership_id: actor&.id,
                               settings_snapshot: { salary_method: defaults.absent_rule, fixed_divisor: defaults.fixed_divisor, rules_enabled: defaults.rules_enabled, defaults: PayrollSerializers.rule(defaults) })
      employees = Employee.active.select { |e| e.active_on?(from) || e.active_on?(to) }
      employees = employees.select { |e| e.branch_id.nil? || e.branch_id == branch.id } if branch
      main_branch = branch || Branch.active.order(is_main: :desc).first
      commissions = Reports::Commissions.run(branch: main_branch, from: from, to: to)[:rows].group_by { |r| r[:membership_id] }
      tips_total = Order.where(business_day: from..to, status: %w[paid closed]).sum(:tip_minor)
      tip_sharers = employees.select(&:shares_tips)
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
        earnings = comps.select { |c| c[:kind] == "earning" }.sum { |c| c[:amount_minor] }
        deductions = comps.select { |c| c[:kind] == "deduction" }.sum { |c| c[:amount_minor] }
        commission = e.membership_id ? (commissions[e.membership_id] || []).sum { |r| r[:commission_minor] } : 0
        tips = tip_sharers.any? && e.shares_tips ? tips_total / tip_sharers.size : 0
        gross = base + earnings + commission + tips + overtime
        advances = Advance.where(employee_id: e.id, status: "paid").where("outstanding_minor > 0").order(:requested_on)
        recoverable = [gross - deductions - absence - att[:fines_minor], 0].max
        recovered = 0
        adv_detail = advances.map do |a|
          take = [a.installment_minor || a.outstanding_minor, a.outstanding_minor, recoverable - recovered].min
          recovered += take
          { advance: a.label, taken_minor: take, outstanding_after_minor: a.outstanding_minor - take }
        end
        net = gross - deductions - absence - att[:fines_minor] - recovered
        Payslip.create!(payroll_run: run, employee: e, base_minor: base, earnings_minor: earnings + commission + tips + overtime, deductions_minor: deductions, absence_minor: absence, late_fines_minor: att[:fines_minor],
                        advances_recovered_minor: recovered, tips_minor: tips, commission_minor: commission, net_minor: net, days_present: att[:present], days_absent: att[:absent], days_leave: att[:leave],
                        detail: { components: comps, attendance: att, advances: adv_detail, active_days: active_days, days_in_month: days_in_month, absent_rule: rule.absent_rule, divisor: divisor,
                                  daily_rate_minor: (BigDecimal(e.base_salary_minor.to_s) / divisor).round, absence_days: absence_days.to_f, lost_days: att[:lost_days], overtime_minor: overtime,
                                  charges: att[:charges], rule: PayrollSerializers.rule(rule) })
      end
      run.update!(employees_count: run.payslips.count, gross_minor: run.payslips.sum(:base_minor) + run.payslips.sum(:earnings_minor), deductions_minor: run.payslips.sum("deductions_minor + absence_minor + late_fines_minor + advances_recovered_minor"), net_minor: run.payslips.sum(:net_minor))
      AuditLog.record(action: "payroll_generate", record: run, after: { month: month, employees: run.employees_count, net_minor: run.net_minor })
      run
    end

    # Pays every payslip from an account as salary expenses (payroll sync) and closes the advances recovered.
    def pay!(run, actor:, branch:, method_code: "cash")
      raise Api::Errors::Conflict.new("payroll.status", "Payroll is #{run.status}") unless run.status.in?(%w[generated approved])
      category = ExpenseCategory.active.find_by(name: "Salaries") || ExpenseCategory.create!(name: "Salaries")
      PayrollRun.transaction do
        run.payslips.includes(:employee).each do |p|
          next if p.net_minor <= 0
          e = Expenses::Recorder.create!({ category_id: category.id, amount_minor: p.net_minor, method_code: method_code, paid_to: p.employee.name, note: "Salary #{run.label}", spent_on: Date.current.to_s }, actor: actor, branch: branch, source: "payroll_sync")
          p.update!(paid_at: Time.current, expense_id: e.id, payment_account_id: e.payment_account_id)
          Array(p.detail["advances"]).each do |ad|
            a = Advance.find_by(employee_id: p.employee_id, number: ad["advance"].to_s.delete_prefix("ADV-").to_i) or next
            a.update!(outstanding_minor: a.outstanding_minor - ad["taken_minor"].to_i, status: a.outstanding_minor - ad["taken_minor"].to_i <= 0 ? "repaid" : "paid")
          end
        end
        run.update!(status: "paid", paid_at: Time.current, paid_by_membership_id: actor&.id)
        AuditLog.record(action: "payroll_pay", record: run, after: { net_minor: run.net_minor, method: method_code })
      end
      run
    end
  end
end

module Payroll
  # One employee's account with the business: what they earned (monthly salary after deductions, wages with bonuses),
  # what they were paid, and advances given. Balance above zero is still owed to the employee; below zero is advance
  # money the employee owes. Recovering an advance from pay shows in the pay line, so it is not counted twice.
  module Statement
    module_function

    def build(employee, from:, to:)
      all = entries(employee)
      before = all.select { |e| e[:date] < from }
      inside = all.select { |e| e[:date] >= from && e[:date] <= to }
      opening = before.sum { |e| e[:credit_minor] - e[:debit_minor] }
      balance = opening
      inside.each { |e| balance += e[:credit_minor] - e[:debit_minor]; e[:balance_minor] = balance }
      { employee: { id: employee.id, name: employee.name, phone: employee.phone, designation: employee.designation, pay_frequency: employee.pay_frequency, rate_minor: employee.base_salary_minor },
        from: from, to: to, brought_forward_minor: opening, closing_balance_minor: balance, entries: inside,
        totals: { earned_minor: inside.select { |e| e[:kind].in?(%w[salary wage]) }.sum { |e| e[:credit_minor] },
                  paid_minor: inside.select { |e| e[:kind].in?(%w[salary_paid wage_paid]) }.sum { |e| e[:debit_minor] },
                  advances_minor: inside.select { |e| e[:kind] == "advance" }.sum { |e| e[:debit_minor] },
                  recovered_minor: inside.sum { |e| e[:recovered_minor].to_i } },
        advances_outstanding_minor: Advance.where(employee_id: employee.id, status: "paid").sum(:outstanding_minor) }
    end

    def entries(employee)
      rows = []
      Payslip.includes(:payroll_run).where(employee_id: employee.id).where.not(payroll_runs: { status: "cancelled" }).references(:payroll_runs).each do |p|
        run = p.payroll_run
        earned = p.base_minor + p.earnings_minor - p.deductions_minor - p.absence_minor - p.late_fines_minor
        rows << { date: run.month.end_of_month, at: run.created_at, kind: "salary", label: "Salary #{run.month.strftime('%B %Y')}", ref: run.label, credit_minor: earned, debit_minor: 0,
                  detail: "Gross #{(p.base_minor + p.earnings_minor) / 100}, deductions #{(p.deductions_minor + p.absence_minor + p.late_fines_minor) / 100}" }
        next unless p.paid_at
        rows << { date: p.paid_at.to_date, at: p.paid_at, kind: "salary_paid", label: "Salary paid", ref: run.label, credit_minor: 0, debit_minor: p.net_minor, recovered_minor: p.advances_recovered_minor,
                  detail: p.advances_recovered_minor.positive? ? "Advance recovered #{p.advances_recovered_minor / 100}" : nil }
      end
      WagePayment.where(employee_id: employee.id, status: "paid").each do |w|
        period = w.period_from == w.period_to ? w.period_from.strftime("%-d %b") : "#{w.period_from.strftime('%-d %b')} to #{w.period_to.strftime('%-d %b')}"
        rows << { date: w.period_to, at: w.paid_at || w.created_at, kind: "wage", label: "Wage #{period}", ref: w.label, credit_minor: w.gross_minor + w.bonus_minor - w.deductions_minor, debit_minor: 0,
                  detail: "#{w.days_worked.to_f} day(s)#{w.bonus_minor.positive? ? ", bonus #{w.bonus_minor / 100}" : ''}#{w.deductions_minor.positive? ? ", deductions #{w.deductions_minor / 100}" : ''}" }
        rows << { date: (w.paid_at || w.created_at).to_date, at: (w.paid_at || w.created_at) + 1, kind: "wage_paid", label: "Wage paid", ref: w.label, credit_minor: 0, debit_minor: w.net_minor,
                  recovered_minor: w.advance_recovered_minor, detail: w.advance_recovered_minor.positive? ? "Advance recovered #{w.advance_recovered_minor / 100}" : nil }
      end
      Advance.where(employee_id: employee.id, status: %w[paid repaid]).where.not(paid_at: nil).each do |a|
        rows << { date: a.paid_at.to_date, at: a.paid_at, kind: "advance", label: "Advance #{a.label}", ref: a.label, credit_minor: 0, debit_minor: a.amount_minor, detail: a.reason }
      end
      rows.sort_by { |e| [ e[:date], e[:at] ] }
    end
  end
end

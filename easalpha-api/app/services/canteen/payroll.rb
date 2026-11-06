module Canteen
  # The month's meals come off the salary: a deduction line on the payslip and, when the run is paid, a receipt on the
  # worker's account so the ledger clears.
  module Payroll
    module_function

    def enabled?(business = Current.business)
      BusinessModules.on?(business, "canteen") && business.setting("canteen.payroll_deduction") != false
    end

    def for(employee, from:, to:)
      scope = MealClaim.live.where(employee_id: employee.id, plan_date: from..to)
      { meals: scope.count, amount_minor: scope.sum(:worker_price_minor) }
    end

    # Called when a payroll run is paid, whatever the payslip's net. The amount is read again from the live claims of
    # the run's month, so a meal cancelled between generate and pay is not taken; it never goes above what the payslip
    # reserved at generate (a meal claimed since stays on the worker's account), nor above what the salary covered,
    # so an approved net can only go up. When the figure moves, the payslip's canteen line, deductions and net move
    # with it before the salary is paid out. Returns what was settled.
    def settle!(payslip, actor:, branch:)
      comps = Array(payslip.detail["components"])
      reserved = comps.select { |c| c["canteen"] }.sum { |c| c["amount_minor"].to_i }
      return 0 if reserved <= 0
      month = payslip.payroll_run.month
      live = self.for(payslip.employee, from: month.beginning_of_month, to: month.end_of_month)
      covered = reserved + [ payslip.net_minor, 0 ].min # a negative net means the salary did not cover the whole bill
      amount = [ live[:amount_minor], reserved, covered ].min.clamp(0, reserved)
      if amount < reserved
        comps = comps.map { |c| c["canteen"] ? c.merge("name" => "Canteen meals (#{live[:meals]})", "amount_minor" => amount) : c }
        payslip.update!(detail: payslip.detail.merge("components" => comps), deductions_minor: payslip.deductions_minor - (reserved - amount), net_minor: payslip.net_minor + (reserved - amount))
      end
      return 0 if amount <= 0
      customer = Workers.link!(payslip.employee)
      Claims.internal_method!(Claims::PAYROLL_CODE, "Salary deduction")
      Payments::Khata.receive!(customer, amount_minor: amount, method_code: Claims::PAYROLL_CODE, reference: "Payroll #{month}", actor: actor, branch: branch)
      amount
    end
  end
end

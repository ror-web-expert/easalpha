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

    # Called when a payroll run is paid: settles each payslip's canteen deduction against the worker's account.
    def settle!(payslip, actor:, branch:)
      amount = Array(payslip.detail["components"]).select { |c| c["canteen"] }.sum { |c| c["amount_minor"].to_i }
      return if amount <= 0
      employee = payslip.employee
      customer = Workers.link!(employee)
      Claims.internal_method!(Claims::PAYROLL_CODE, "Salary deduction")
      Payments::Khata.receive!(customer, amount_minor: amount, method_code: Claims::PAYROLL_CODE, reference: "Payroll #{payslip.payroll_run.month}", actor: actor, branch: branch)
    end
  end
end

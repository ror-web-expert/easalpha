module Canteen
  # The month's meals come off the salary: a deduction line on the payslip and, when the run is paid, a receipt on the
  # worker's account so the ledger clears. A payslip keeps the ids of the claims it took (detail["canteen"]), so a meal
  # taken after its month's run was generated is not lost: the next run takes it (6 Nov 2026 review, R21).
  module Payroll
    module_function

    def enabled?(business = Current.business)
      BusinessModules.on?(business, "canteen") && business.setting("canteen.payroll_deduction") != false
    end

    def for(employee, from:, to:)
      scope = MealClaim.live.where(employee_id: employee.id, plan_date: from..to)
      { meals: scope.count, amount_minor: scope.sum(:worker_price_minor) }
    end

    # What a payslip for `month` takes: the month's meals plus those of earlier deducted months that no live or paid
    # payslip holds yet (a meal claimed after its month's run was generated). Returns the claim ids, the count, the
    # amount and how many of them came from earlier months.
    def due(employee, month:, deducted: deducted_months)
      month = month.beginning_of_month
      months = [ month, *deducted.select { |m| m < month } ].map { |m| m..m.end_of_month }
      scope = MealClaim.live.where(employee_id: employee.id, plan_date: months)
      held, legacy = holdings(employee)
      scope = scope.where.not(id: held.to_a) if held.any?
      legacy.each { |m, at| scope = scope.where.not(plan_date: m.beginning_of_month..m.end_of_month, created_at: ..at) }
      claims = scope.order(:plan_date, :scanned_at).pluck(:id, :plan_date, :worker_price_minor)
      { claim_ids: claims.map(&:first), meals: claims.size, carried: claims.count { |c| c[1] < month }, amount_minor: claims.sum(&:last) }
    end

    # Months a payroll run took the canteen deduction for (a payslip on a live or paid run with the canteen detail, or
    # a canteen line from before the detail was kept). Meals of any other month were left to be paid at the counter, so
    # a later run never sweeps them up.
    def deducted_months
      Payslip.joins(:payroll_run).where.not(payroll_runs: { status: "cancelled" })
             .where("payslips.detail -> 'canteen' IS NOT NULL OR payslips.detail -> 'components' @> ?::jsonb", [ { canteen: true } ].to_json)
             .distinct.pluck("payroll_runs.month").map(&:beginning_of_month)
    end

    # The claims this employee's live and paid payslips already hold: their ids, and for payslips from before the ids
    # were kept, the month and the moment they were generated (they took that month's claims existing then).
    def holdings(employee)
      held = Set.new
      legacy = []
      Payslip.joins(:payroll_run).where(employee_id: employee.id).where.not(payroll_runs: { status: "cancelled" })
             .pluck(:detail, "payroll_runs.month", :created_at).each do |detail, month, at|
        if detail.is_a?(Hash) && detail["canteen"].is_a?(Hash)
          held.merge(Array(detail["canteen"]["claim_ids"]))
        else
          legacy << [ month, at ]
        end
      end
      [ held, legacy ]
    end

    def line_name(meals, carried) = carried.positive? ? "Canteen meals (#{meals}, #{carried} from earlier months)" : "Canteen meals (#{meals})"

    # Called when a payroll run is paid, whatever the payslip's net. The amount is read again from the claims the
    # payslip holds that are still live, so a meal cancelled between generate and pay is not taken; it never goes above
    # what the payslip reserved at generate (a meal claimed since is the next run's), nor above what the salary covered,
    # so an approved net can only go up. When the figure moves, the payslip's canteen line, deductions and net move
    # with it before the salary is paid out. Returns what was settled.
    def settle!(payslip, actor:, branch:)
      comps = Array(payslip.detail["components"])
      reserved = comps.select { |c| c["canteen"] }.sum { |c| c["amount_minor"].to_i }
      return 0 if reserved <= 0
      month = payslip.payroll_run.month
      live = still_live(payslip, month)
      covered = reserved + [ payslip.net_minor, 0 ].min # a negative net means the salary did not cover the whole bill
      amount = [ live[:amount_minor], reserved, covered ].min.clamp(0, reserved)
      if amount < reserved
        comps = comps.map { |c| c["canteen"] ? c.merge("name" => line_name(live[:meals], live[:carried]), "amount_minor" => amount) : c }
        payslip.update!(detail: payslip.detail.merge("components" => comps), deductions_minor: payslip.deductions_minor - (reserved - amount), net_minor: payslip.net_minor + (reserved - amount))
      end
      return 0 if amount <= 0
      customer = Workers.link!(payslip.employee)
      Claims.internal_method!(Claims::PAYROLL_CODE, "Salary deduction")
      # Salary the worker earned clears what they owe for meals: the journal books it as salary expense against the
      # receivable (Finance::Journal.internal_receipt!), so the run's salary expense is gross of the deduction.
      Payments::Khata.receive!(customer, amount_minor: amount, method_code: Claims::PAYROLL_CODE, reference: "Payroll #{month}", actor: actor, branch: branch, internal: true)
      amount
    end

    # The payslip's claims that were not cancelled since. A payslip from before the ids were kept reads its month's
    # live claims, as it did then.
    def still_live(payslip, month)
      ids = payslip.detail.dig("canteen", "claim_ids")
      return self.for(payslip.employee, from: month.beginning_of_month, to: month.end_of_month).merge(carried: 0) unless ids
      claims = MealClaim.live.where(id: ids).pluck(:plan_date, :worker_price_minor)
      { meals: claims.size, carried: claims.count { |d, _| d < month.beginning_of_month }, amount_minor: claims.sum(&:last) }
    end
  end
end

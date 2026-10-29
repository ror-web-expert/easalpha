module Canteen
  # Meals by day, session, dish or department, and per worker, over any date range: the same from-to the other reports use.
  module Reports
    module_function

    GROUPS = %w[day session dish department].freeze

    def summary(branch:, from:, to:, group_by: "day")
      group_by = GROUPS.include?(group_by.to_s) ? group_by.to_s : "day"
      base = MealClaim.live.where(branch_id: branch.id, plan_date: from..to)
      grouped = case group_by
      when "session" then base.joins(:meal_session).group("meal_sessions.name")
      when "dish" then base.joins(meal_plan_item: :product).group("products.name")
      when "department" then base.left_joins(employee: :department).group(Arel.sql("COALESCE(departments.name, 'No department')"))
      else base.group(:plan_date)
      end
      meals = grouped.count
      served = grouped.where(status: "served").count
      worker = grouped.sum(:worker_price_minor)
      company = grouped.sum(:company_share_minor)
      workers = grouped.distinct.count(:employee_id)
      planned = planned_by(branch, from, to, group_by)
      rows = meals.keys.sort_by(&:to_s).map do |k|
        { key: k.to_s, meals: meals[k], served: served[k] || 0, workers: workers[k] || 0, planned: planned[k.to_s], worker_minor: worker[k] || 0, company_minor: company[k] || 0, total_minor: (worker[k] || 0) + (company[k] || 0) }
      end
      { from: from, to: to, group_by: group_by, rows: rows,
        totals: { meals: rows.sum { |r| r[:meals] }, served: rows.sum { |r| r[:served] }, worker_minor: rows.sum { |r| r[:worker_minor] }, company_minor: rows.sum { |r| r[:company_minor] }, total_minor: rows.sum { |r| r[:total_minor] } } }
    end

    # Dishes cooked, from the published plans, for the groups that have a plan (not departments).
    def planned_by(branch, from, to, group_by)
      scope = MealPlanItem.joins(meal_plan: :meal_session).joins(:product).where(meal_plans: { branch_id: branch.id, plan_date: from..to, status: "published" })
      case group_by
      when "session" then scope.group("meal_sessions.name").sum(:planned_qty)
      when "dish" then scope.group("products.name").sum(:planned_qty)
      when "day" then scope.group("meal_plans.plan_date").sum(:planned_qty).transform_keys(&:to_s)
      else {}
      end.transform_keys(&:to_s)
    end

    def workers(branch:, from:, to:)
      base = MealClaim.live.where(branch_id: branch.id, plan_date: from..to)
      meals = base.group(:employee_id).count
      worker = base.group(:employee_id).sum(:worker_price_minor)
      company = base.group(:employee_id).sum(:company_share_minor)
      last = base.group(:employee_id).maximum(:scanned_at)
      employees = Employee.includes(:department).where(id: meals.keys).index_by(&:id)
      rows = meals.keys.map do |id|
        e = employees[id]
        { employee_id: id, name: e&.name || "?", department: e&.department&.name, designation: e&.designation, customer_id: e&.customer_id, meals: meals[id], worker_minor: worker[id] || 0, company_minor: company[id] || 0, last_meal_at: last[id] }
      end.sort_by { |r| r[:name].to_s }
      { from: from, to: to, rows: rows, totals: { meals: rows.sum { |r| r[:meals] }, worker_minor: rows.sum { |r| r[:worker_minor] }, company_minor: rows.sum { |r| r[:company_minor] } } }
    end

    def worker(employee, from:, to:)
      claims = MealClaim.includes(:meal_session, meal_plan_item: :product).where(employee_id: employee.id, plan_date: from..to).order(scanned_at: :desc)
      { employee: { id: employee.id, name: employee.name, department: employee.department&.name, customer_id: employee.customer_id }, from: from, to: to,
        claims: claims.map { |c| CanteenSerializers.claim(c) }, meals: claims.count(&:cancelled?).then { |x| claims.size - x }, worker_minor: claims.reject(&:cancelled?).sum(&:worker_price_minor) }
    end

    def csv(rows, columns)
      CSV.generate do |csv|
        csv << columns.map { |c| c[:label] }
        rows.each { |r| csv << columns.map { |c| c[:value].call(r) } }
      end
    end
  end
end

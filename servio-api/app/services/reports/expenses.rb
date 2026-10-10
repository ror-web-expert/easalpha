module Reports
  # Expenses by category and method for a range, with overheads allocated to the same period.
  module Expenses
    module_function

    def summary(branch:, from:, to:)
      scope = Expense.live.where(branch_id: branch.id, spent_on: from..to).includes(:category, :payment_method)
      by_cat = scope.group_by { |e| e.category.parent_id ? e.category.parent.name : e.category.name }.map { |k, es| { category: k, count: es.size, amount_minor: es.sum(&:amount_minor) } }.sort_by { |r| -r[:amount_minor] }
      by_sub = scope.group_by { |e| e.category.full_name }.map { |k, es| { category: k, count: es.size, amount_minor: es.sum(&:amount_minor) } }.sort_by { |r| -r[:amount_minor] }
      by_method = scope.group_by { |e| e.payment_method&.code || "none" }.map { |k, es| { method: k, count: es.size, amount_minor: es.sum(&:amount_minor) } }
      by_source = scope.group(:source).sum(:amount_minor)
      days = (to - from).to_i + 1
      orders = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed]).count
      overheads = Overhead.active.where("branch_id = ? OR branch_id IS NULL", branch.id).map { |o| { id: o.id, name: o.name, kind: o.kind, basis: o.basis, amount_minor: o.amount_minor, allocated_minor: o.allocate(orders: orders, days: days) } }
      total = scope.sum(:amount_minor)
      overhead_total = overheads.sum { |o| o[:allocated_minor] }
      count = scope.count
      # SPEC: total, average, count and category count
      { from: from, to: to, days: days, paid_orders: orders, total_minor: total, count: count, average_minor: count.zero? ? 0 : (total / count), category_count: by_cat.size, subcategory_count: by_sub.size,
        by_category: by_cat, by_subcategory: by_sub, by_method: by_method, by_source: by_source,
        overheads: overheads, overheads_minor: overhead_total, cost_per_order_minor: orders.zero? ? nil : ((total + overhead_total) / orders) }
    end
  end
end

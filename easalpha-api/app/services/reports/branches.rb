module Reports
  # Multi-branch comparison for a period, and the combined dashboard numbers.
  module Branches
    module_function

    def compare(from:, to:)
      rows = Branch.active.order(is_main: :desc, name: :asc).map do |b|
        paid = Order.where(branch_id: b.id, business_day: from..to, status: %w[paid closed refunded])
        voided = Order.where(branch_id: b.id, business_day: from..to, status: "voided")
        expenses = Expense.live.where(branch_id: b.id, spent_on: from..to).sum(:amount_minor)
        cogs = -StockLedgerEntry.where(branch_id: b.id, business_day: from..to, kind: %w[sale sale_return packaging]).sum(:value_minor)
        revenue = paid.sum(:total_minor)
        { branch: Serializers.branch(b), orders: paid.count, revenue_minor: revenue, average_order_minor: paid.count.zero? ? 0 : revenue / paid.count, discounts_minor: paid.sum(:discount_minor),
          voided: voided.count, voided_minor: voided.sum(:total_minor), expenses_minor: expenses, cost_of_goods_minor: cogs, gross_profit_minor: revenue - paid.sum(:tax_minor) - cogs,
          khata_minor: Payment.where(branch_id: b.id, business_day: from..to, method_code: "khata", status: "captured").sum(:amount_minor), by_type: paid.group(:order_type).count }
      end
      total = rows.sum { |r| r[:revenue_minor] }
      rows.each { |r| r[:share_percent] = total.zero? ? 0 : (r[:revenue_minor] * 100.0 / total).round(1) }
      { from: from, to: to, rows: rows, total_revenue_minor: total, total_orders: rows.sum { |r| r[:orders] } }
    end
  end
end

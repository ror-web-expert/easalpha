module Reports
  # Multi-branch comparison for a period, and the combined dashboard numbers.
  module Branches
    module_function

    def compare(from:, to:)
      rows = Branch.active.order(is_main: :desc, name: :asc).map do |b|
        # Revenue by the one rule (Reports::Revenue); gross profit is the income the profit and loss shows (net of tax
        # and tips) less the cost of goods.
        period = Revenue.period(branch: b, from: from, to: to)
        paid = period.orders
        t = period.totals
        voided = Order.where(branch_id: b.id, business_day: from..to, status: "voided")
        expenses = Expense.live.where(branch_id: b.id, spent_on: from..to).sum(:amount_minor)
        cogs = -StockLedgerEntry.where(branch_id: b.id, business_day: from..to, kind: %w[sale sale_return packaging]).sum(:value_minor)
        revenue = t[:revenue_minor]
        { branch: Serializers.branch(b), orders: t[:orders], revenue_minor: revenue, average_order_minor: t[:orders].zero? ? 0 : revenue / t[:orders], discounts_minor: t[:discount_minor],
          voided: voided.count, voided_minor: voided.sum(:total_minor), expenses_minor: expenses, cost_of_goods_minor: cogs, gross_profit_minor: t[:income_minor] - cogs,
          khata_minor: Payment.by_method_kind("khata").where(branch_id: b.id, business_day: from..to, status: "captured").sum(:amount_minor), by_type: paid.group(:order_type).count }
      end
      total = rows.sum { |r| r[:revenue_minor] }
      rows.each { |r| r[:share_percent] = total.zero? ? 0 : (r[:revenue_minor] * 100.0 / total).round(1) }
      { from: from, to: to, rows: rows, total_revenue_minor: total, total_orders: rows.sum { |r| r[:orders] } }
    end
  end
end

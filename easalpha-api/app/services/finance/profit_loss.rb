module Finance
  # Profit and loss for a period: net sales, cost of goods from the stock ledger, expenses, overheads, commissions, aggregator commission.
  # Revenue is the one rule every report uses (Reports::Revenue), so it is the sales report's figure: a fully refunded
  # order is zero, and a staff meal earns nothing while the ingredients it used stay in cost of goods. Net sales is
  # revenue less the tax collected, as on the stock and branch reports.
  module ProfitLoss
    module_function

    def run(branch:, from:, to:)
      orders = Order.where(branch_id: branch.id, business_day: from..to)
      completed = Reports::Revenue.completed(orders)
      revenue = Reports::Revenue.sum(completed)
      tax = Reports::Revenue.tax(completed)
      net_sales = revenue - tax
      # What the orders sold were made of; a staff meal's menu price is no sale, so its lines stay out of these.
      sold = completed.where(is_staff_meal: false)
      discounts, service, delivery, tips, rounding = %i[discount_minor service_charge_minor delivery_charge_minor tip_minor rounding_minor].map { |c| sold.sum(c) }
      refunds = Refund.where(order_id: completed.select(:id)).sum(:amount_minor)
      # Sales before discounts and without tax (the journal's sales part with the discounts added back): what the
      # other lines leave of net sales, so the statement adds up to it.
      gross = net_sales + discounts + refunds - service - delivery - tips - rounding
      # The platform's commission stands on a refunded order too, as on the Foodpanda report.
      aggregator = orders.where(status: %w[paid closed refunded]).sum(:aggregator_commission_minor)
      cogs = -StockLedgerEntry.where(branch_id: branch.id, business_day: from..to, kind: %w[sale sale_return packaging]).sum(:value_minor)
      waste = -StockLedgerEntry.where(branch_id: branch.id, business_day: from..to, kind: "waste").sum(:value_minor)
      ex = Reports::Expenses.summary(branch: branch, from: from, to: to)
      commissions = Reports::Commissions.run(branch: branch, from: from, to: to)[:total_commission_minor]
      gross_profit = net_sales - cogs
      operating = ex[:total_minor] + ex[:overheads_minor] + commissions + aggregator + waste
      net = gross_profit - operating
      { from: from, to: to, orders: completed.count,
        revenue: { revenue_minor: revenue, gross_sales_minor: gross, discounts_minor: discounts, service_charge_minor: service, delivery_charge_minor: delivery, tips_minor: tips,
                   rounding_minor: rounding, refunds_minor: refunds, net_sales_minor: net_sales, tax_collected_minor: tax },
        cost_of_goods_minor: cogs, gross_profit_minor: gross_profit, gross_margin_percent: net_sales.zero? ? nil : (gross_profit * 100.0 / net_sales).round(1),
        operating: { expenses_minor: ex[:total_minor], expenses_by_category: ex[:by_category], overheads_minor: ex[:overheads_minor], overheads: ex[:overheads], commissions_minor: commissions, aggregator_commission_minor: aggregator, waste_minor: waste, total_minor: operating },
        net_profit_minor: net, net_margin_percent: net_sales.zero? ? nil : (net * 100.0 / net_sales).round(1) }
    end
  end
end

module Finance
  # Profit and loss for a period: net sales, cost of goods from the stock ledger, expenses, overheads, commissions, aggregator commission.
  module ProfitLoss
    module_function

    def run(branch:, from:, to:)
      paid = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded])
      gross = paid.sum(:subtotal_minor)
      discounts = paid.sum(:discount_minor)
      service = paid.sum(:service_charge_minor)
      delivery = paid.sum(:delivery_charge_minor)
      tax = paid.sum(:tax_minor)
      refunds = Refund.where(branch_id: branch.id, business_day: from..to).sum(:amount_minor)
      aggregator = paid.sum(:aggregator_commission_minor)
      net_sales = gross - discounts + service + delivery - refunds
      cogs = -StockLedgerEntry.where(branch_id: branch.id, business_day: from..to, kind: %w[sale sale_return packaging]).sum(:value_minor)
      waste = -StockLedgerEntry.where(branch_id: branch.id, business_day: from..to, kind: "waste").sum(:value_minor)
      ex = Reports::Expenses.summary(branch: branch, from: from, to: to)
      commissions = Reports::Commissions.run(branch: branch, from: from, to: to)[:total_commission_minor]
      gross_profit = net_sales - cogs
      operating = ex[:total_minor] + ex[:overheads_minor] + commissions + aggregator + waste
      net = gross_profit - operating
      { from: from, to: to, orders: paid.count,
        revenue: { gross_sales_minor: gross, discounts_minor: discounts, service_charge_minor: service, delivery_charge_minor: delivery, refunds_minor: refunds, net_sales_minor: net_sales, tax_collected_minor: tax },
        cost_of_goods_minor: cogs, gross_profit_minor: gross_profit, gross_margin_percent: net_sales.zero? ? nil : (gross_profit * 100.0 / net_sales).round(1),
        operating: { expenses_minor: ex[:total_minor], expenses_by_category: ex[:by_category], overheads_minor: ex[:overheads_minor], overheads: ex[:overheads], commissions_minor: commissions, aggregator_commission_minor: aggregator, waste_minor: waste, total_minor: operating },
        net_profit_minor: net, net_margin_percent: net_sales.zero? ? nil : (net * 100.0 / net_sales).round(1) }
    end
  end
end

module Reports
  # The one revenue rule (review of 6 Nov 2026): revenue is the total of paid and closed orders minus the refunds made
  # on those orders. A fully refunded order has status "refunded", so it is neither counted nor subtracted: it
  # contributes zero. Every report sums NET over a completed scope, so the sales report, the dashboard, COGS,
  # commissions, the branch comparison and the profit and loss (Finance::ProfitLoss) agree to the rupee.
  module Revenue
    COMPLETED = %w[paid closed].freeze
    # An order's total less its refunds, usable in any plain or grouped sum over the orders table.
    NET_SQL = "(orders.total_minor - COALESCE((SELECT SUM(refunds.amount_minor) FROM refunds WHERE refunds.order_id = orders.id), 0))".freeze
    NET = Arel.sql(NET_SQL)

    module_function

    def completed(orders) = orders.where(status: COMPLETED)
    def sum(orders) = completed(orders).sum(NET).to_i

    # The tax collected on the completed orders, for revenue net of tax. A staff meal charges nothing, so the tax its
    # lines work out was never collected (the journal books none for it either).
    def tax(orders) = completed(orders).where(is_staff_meal: false).sum(:tax_minor).to_i
  end
end

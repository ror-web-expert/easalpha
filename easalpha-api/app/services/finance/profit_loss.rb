module Finance
  # Profit and loss for a period, and the books' own figure (review of 6 Nov 2026, B13, B14): its net profit is what the
  # journal holds on the income and expense accounts for those days, so from the first day of the books it is the
  # balance sheet's current earnings.
  # - Revenue is the one revenue rule (Reports::Revenue), the sales report's figure, split as the journal splits each
  #   sale and refund: net sales with the service charge, delivery charge and rounding are income; the tax collected
  #   (the Tax Payable movement) and the tips (the staff's) are not.
  # - Cost of goods, waste and the count and adjustment differences come from the stock ledger the journal mirrors;
  #   expenses are the expense records by category.
  # - Whatever else the journal holds on an income or expense account for those days is listed by account as other
  #   entries in the books: drawer payouts and cash outs, depreciation, account and supplier adjustments, the stock
  #   revaluation of a cancelled receipt, manual vouchers, and the timing of a payment or an expense booked on another
  #   day than the order or the spend it belongs to.
  # - Allocated overheads, the commissions the rules work out and the platform's commission are not in the books (the
  #   commissions reach them with the salaries they are paid in); they are shown apart, with the profit after them.
  module ProfitLoss
    module_function

    INCOME_ACCOUNTS = { sales: "4000", service_charge: "4010", delivery_charge: "4020", rounding: "4120" }.freeze

    def run(branch:, from:, to:)
      period = Reports::Revenue.period(branch: branch, from: from, to: to)
      t = period.totals
      sold, back, net = t[:sold_parts], t[:refund_parts], t[:parts]
      net_sales = t[:income_minor]
      cogs = -stock_value(branch, from, to, %w[sale sale_return packaging])
      waste = -stock_value(branch, from, to, %w[waste])
      differences = -stock_value(branch, from, to, %w[count adjustment])
      ex = Reports::Expenses.summary(branch: branch, from: from, to: to)
      gross_profit = net_sales - cogs

      # What the lines above put on each account, against what the books hold there for the same days.
      mapped = Hash.new(0)
      INCOME_ACCOUNTS.each { |part, code| mapped[code] += net[part] }
      mapped["5000"] += cogs
      mapped["5200"] += waste + differences
      expense_accounts(branch, from, to).each { |code, amount| mapped[code] += amount }
      books = book_accounts(branch, from, to)
      (mapped.keys - books.map { |a| a[:code] }).each do |code|
        _, name, kind = Chart::CHART.find { |row| row[0] == code }
        books << { code: code, name: name || code, kind: kind || "expense", amount_minor: 0 }
      end
      other = books.filter_map do |a|
        diff = a[:amount_minor] - mapped[a[:code]]
        { code: a[:code], name: a[:name], kind: a[:kind], amount_minor: a[:kind] == "income" ? -diff : diff } unless diff.zero?
      end
      other_minor = other.sum { |o| o[:amount_minor] }
      operating = ex[:total_minor] + waste + differences + other_minor
      net_profit = gross_profit - operating
      book_income = books.select { |a| a[:kind] == "income" }.sum { |a| a[:amount_minor] }
      book_expenses = books.select { |a| a[:kind] == "expense" }.sum { |a| a[:amount_minor] }

      commissions = Reports::Commissions.run(branch: branch, from: from, to: to)[:total_commission_minor]
      # The platform's commission stands on a refunded order too, as on the Foodpanda report.
      aggregator = Order.where(branch_id: branch.id, business_day: from..to, status: Reports::Revenue::SOLD).sum(:aggregator_commission_minor)
      not_booked = ex[:overheads_minor] + commissions + aggregator

      { from: from, to: to, orders: t[:orders],
        revenue: { revenue_minor: t[:revenue_minor], gross_sales_minor: sold[:sales] + t[:discount_minor], discounts_minor: t[:discount_minor], refunds_minor: back[:sales],
                   service_charge_minor: net[:service_charge], delivery_charge_minor: net[:delivery_charge], rounding_minor: net[:rounding], net_sales_minor: net_sales,
                   tax_collected_minor: t[:tax_minor], tips_minor: t[:tips_minor] },
        cost_of_goods_minor: cogs, gross_profit_minor: gross_profit, gross_margin_percent: percent(gross_profit, net_sales),
        operating: { expenses_minor: ex[:total_minor], expenses_by_category: ex[:by_category], waste_minor: waste, stock_differences_minor: differences,
                     other_minor: other_minor, other: other, total_minor: operating },
        net_profit_minor: net_profit, net_margin_percent: percent(net_profit, net_sales),
        books: { income_minor: book_income, expenses_minor: book_expenses, net_minor: book_income - book_expenses },
        not_booked: { overheads_minor: ex[:overheads_minor], overheads: ex[:overheads], commissions_minor: commissions, aggregator_commission_minor: aggregator,
                      total_minor: not_booked, net_after_minor: net_profit - not_booked } }
    end

    def percent(part, whole) = whole.zero? ? nil : (part * 100.0 / whole).round(1)

    def stock_value(branch, from, to, kinds) = StockLedgerEntry.where(branch_id: branch.id, business_day: from..to, kind: kinds).sum(:value_minor)

    # The live expenses of the period by the account the journal books each to (its category's, Chart.for_expense_category).
    def expense_accounts(branch, from, to)
      Expense.live.where(branch_id: branch.id, spent_on: from..to).includes(category: :parent)
             .group_by { |e| Chart::EXPENSE_PARENTS.fetch((e.category.parent || e.category).name, "5190") }.transform_values { |es| es.sum(&:amount_minor) }
    end

    # Every income and expense account with what the journal holds on it for the period, on the profit side: income
    # credits less debits, expenses the reverse. A branch's own entries; the main branch also takes the entries made
    # for no branch, so one branch's books are the whole of them.
    def book_accounts(branch, from, to)
      entries = JournalEntry.where(business_day: from..to)
      main = Branch.order(is_main: :desc, created_at: :asc).first&.id == branch.id
      entries = entries.where(branch_id: main ? [ branch.id, nil ] : branch.id)
      sums = JournalLine.where(journal_entry_id: entries.select(:id)).group(:gl_account_id).pluck(:gl_account_id, Arel.sql("SUM(debit_minor)"), Arel.sql("SUM(credit_minor)"))
                        .to_h { |id, d, c| [ id, [ d.to_i, c.to_i ] ] }
      GlAccount.posting.where(kind: %w[income expense]).order(:code).map do |a|
        d, c = sums[a.id] || [ 0, 0 ]
        { code: a.code, name: a.name, kind: a.kind, amount_minor: a.kind == "income" ? c - d : d - c }
      end
    end
  end
end

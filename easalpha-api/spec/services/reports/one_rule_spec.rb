require "rails_helper"

# The one revenue rule across every report (final round of 6 Nov 2026: reports#0-#4, #6, #8, #9, B5, B13, B14). One
# business day: a paid order, a part-refunded one, a fully refunded one, a reopened one whose excess was refunded, a
# staff meal and a khata sale, then an expense, a drawer payout and a count that finds buns missing. Every report and
# the profit and loss say the same revenue and tax, the tax is the Tax Payable movement, and the profit and loss's net
# is the balance sheet's current earnings. A refund the next day, after the day was closed, leaves the closed day as
# it stood and lands on its own day.
RSpec.describe "The one revenue rule", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let!(:m) { build_menu!(biz) }
  let(:day) { today_for(biz) }

  before do
    within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      Unit.seed_defaults!
      ExpenseCategory.seed_defaults!
    end
  end

  def h = auth_headers(owner)

  def order!(lines, **extra)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: h
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o, method = "cash")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: method, amount_minor: o[:total_minor] } ] }, headers: h
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def refund!(o, amount)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: "cash", reason: "cold" }, headers: h
    expect(response).to have_http_status(:created), response.body
  end

  def complete!(o)
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: h
    expect(response).to have_http_status(:ok), response.body
  end

  # What the journal holds for some days: the Tax Payable and Tips Payable movements and the earnings.
  def books(from, to = from)
    within(biz) do
      lines = JournalLine.joins(:journal_entry, :gl_account).where(journal_entries: { business_day: from..to })
      movement = ->(code) { lines.where(gl_accounts: { code: code }).sum("credit_minor - debit_minor").to_i }
      income = lines.where(gl_accounts: { kind: "income" }).sum("credit_minor - debit_minor").to_i
      expense = lines.where(gl_accounts: { kind: "expense" }).sum("debit_minor - credit_minor").to_i
      { tax: movement.call("2100"), tips: movement.call("2400"), earnings: income - expense }
    end
  end

  # Revenue and tax as each report states them for some days.
  def figures(from, to = from)
    within(biz) do
      sales = Reports::Sales.new(branch: branch, from: from, to: to)
      overview = sales.overview
      pl = Finance::ProfitLoss.run(branch: branch, from: from, to: to)
      detail = Reports::Catalogue.sales_detail(branch: branch, from: from, to: to)[:totals]
      revenue = {
        overview: overview[:revenue_minor], by_day: sales.by_day.sum { |r| r[:revenue_minor] }, by_hour: sales.by_hour.sum { |r| r[:revenue_minor] },
        cashiers: sales.cashiers.sum { |r| r[:revenue_minor] }, order_takers: sales.order_takers.sum { |r| r[:revenue_minor] },
        dashboard: Reports::Dashboard.spec(branch, period: "custom", from: from.to_s, to: to.to_s)[:cards][:total_revenue_minor],
        branches: Reports::Branches.compare(from: from, to: to)[:rows].first[:revenue_minor], grand: Reports::Catalogue.grand(branch: branch, from: from, to: to)[:sales_minor],
        sales_detail: detail[:revenue_minor], cashier_till: Reports::CashierTill.run(branch: branch, from: from, to: to)[:totals][:taken_minor],
        commissions: Reports::Commissions.run(branch: branch, from: from, to: to)[:rows].find { |r| r[:applies_to] == "cashier" }&.dig(:sales_minor).to_i,
        profit_and_loss: pl[:revenue][:revenue_minor]
      }
      revenue[:calendar] = Reports::Catalogue.calendar(branch: branch, month: from)[:days].select { |d| d[:date].between?(from, to) }.sum { |d| d[:revenue_minor] } if from.month == to.month
      revenue[:day_close] = Shifts::DayCloser.summarise(branch, from)[:net_sales_minor] if from == to
      tax = { overview: overview[:tax_minor], by_day: sales.by_day.sum { |r| r[:tax_minor] }, sales_detail: detail[:tax_minor], profit_and_loss: pl[:revenue][:tax_collected_minor] }
      tax[:day_close] = Shifts::DayCloser.summarise(branch, from)[:tax_minor] if from == to
      { revenue: revenue, tax: tax, income: [ pl[:revenue][:net_sales_minor], Reports::Stock.valuation_cogs(branch: branch, from: from, to: to)[:revenue_minor] ], pl: pl, overview: overview }
    end
  end

  it "gives one revenue and one tax figure in every report, the tax the journal's and the net its earnings" do
    within(biz) do
      CommissionRule.create!(name: "Per order", applies_to: "cashier", basis: "per_order", value: 10)
      InventorySetting.current.update!(counting_open: true)
    end
    bun = within(biz) do
      b = StockItem.create!(name: "Bun", base_unit: Unit.find_by!(code: "pcs"))
      Stock::Posting.post!(Stock::Posting.create!({ kind: "receive", to_section_id: StockSection.default_for(branch).id }, lines: [ { stock_item_id: b.id, quantity: 100, unit_cost_minor: 2_000 } ], actor: owner, branch: branch), actor: owner)
      b
    end
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Burger", lines: [ { stock_item_id: bun.id, quantity: 1 } ] }, headers: h
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: h
    expect(response).to have_http_status(:created), response.body
    shift = json

    pay!(order!([ { product_id: m[:burger].id } ]))                     # Rs 522
    part = order!([ { product_id: m[:burger].id } ])
    pay!(part)
    refund!(part, 10_000)                                               # Rs 422 stays
    gone = order!([ { product_id: m[:chai].id } ])
    pay!(gone)
    refund!(gone, gone[:total_minor])                                   # nothing stays
    reopened = order!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ])
    paid = pay!(reopened)                                               # Rs 614.80 taken
    api_post "/api/v1/orders/#{reopened[:id]}/reopen", {}, headers: h
    expect(response).to have_http_status(:ok), response.body
    burger_line = paid[:items].find { |i| i[:name] == "Zinger Burger" }[:id]
    api_patch "/api/v1/orders/#{reopened[:id]}", { lines: [ { id: burger_line, product_id: m[:burger].id } ] }, headers: h
    expect(response).to have_http_status(:ok), response.body
    expect(json[:total_minor]).to eq(52_200)
    refund!(reopened, 9_280)                                            # the chai's Rs 92.80 handed back
    complete!(reopened)                                                 # Rs 522 stays, not Rs 429.20
    complete!(order!([ { product_id: m[:burger].id } ], is_staff_meal: true, staff_meal_reason: "Kitchen lunch"))
    api_post "/api/v1/customers", { name: "Ali Raza", phone: "+923001112233" }, headers: h
    expect(response).to have_http_status(:created), response.body
    pay!(order!([ { product_id: m[:burger].id } ], customer_id: json[:id]), "khata") # Rs 522 on account

    utilities = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
    api_post "/api/v1/expenses", { category_id: utilities.id, amount_minor: 5_000, method_code: "cash", paid_to: "K-Electric" }, headers: h
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "payout", amount_minor: 3_000, reason: "Ice" }, headers: h
    expect(response).to have_http_status(:created), response.body
    within(biz) do
      count = Stock::Posting.create!({ kind: "count", from_section_id: StockSection.default_for(branch).id }, lines: [ { stock_item_id: bun.id, counted_qty: 90 } ], actor: owner, branch: branch)
      Stock::Posting.post!(count, actor: owner) # 95 expected after five burgers: five buns short
    end

    # Rs 522 + Rs 422 + 0 + Rs 522 + Rs 522; tax Rs 72 on each, less Rs 13.79 for the Rs 100 refund.
    f = figures(day)
    expect(f[:revenue].values.uniq).to eq([ 198_800 ]), f[:revenue].inspect
    expect(f[:tax].values.uniq).to eq([ 27_421 ]), f[:tax].inspect
    expect(books(day)).to include(tax: 27_421, tips: 0)
    expect(f[:income].uniq).to eq([ 198_800 - 27_421 ])
    expect(f[:overview]).to include(orders: 5, refunds_minor: 19_280)

    pl = f[:pl]
    expect(pl).to include(cost_of_goods_minor: 10_000, gross_profit_minor: 171_379 - 10_000)
    expect(pl[:operating]).to include(expenses_minor: 5_000, stock_differences_minor: 10_000, other_minor: 3_000)
    expect(pl[:operating][:other]).to eq([ { code: "5190", name: "Other Expenses", kind: "expense", amount_minor: 3_000 } ]) # the payout
    expect(pl[:net_profit_minor]).to eq(171_379 - 10_000 - 5_000 - 10_000 - 3_000)
    expect(pl[:net_profit_minor]).to eq(books(day)[:earnings])
    expect(pl[:net_profit_minor]).to eq(within(biz) { Finance::Statements.balance_sheet(as_of: day)[:current_earnings_minor] })

    within(biz) do
      sales = Reports::Sales.new(branch: branch, from: day, to: day)
      # A staff meal is no sale: not in items, categories, top sellers or the per-order commission.
      expect(sales.items.map { |r| [ r[:name], r[:quantity] ] }).to eq([ [ "Zinger Burger", 4.0 ] ])
      expect(sales.categories.map { |r| [ r[:name], r[:quantity] ] }).to eq([ [ "Mains", 4.0 ] ])
      expect(Reports::Dashboard.spec(branch, period: "today")[:top_selling].map { |r| r[:quantity] }).to eq([ 4.0 ])
      expect(Reports::Commissions.run(branch: branch, from: day, to: day)[:rows].find { |r| r[:applies_to] == "cashier" }).to include(orders: 4, commission_minor: 4_000)
      # Every sale at the hour it was paid, none at midnight for want of a paid_at.
      expect(sales.by_hour.find { |r| r[:hour] == Time.current.in_time_zone(branch.time_zone).hour }[:orders]).to eq(5)
      expect(Reports::Catalogue.sales_detail(branch: branch, from: day, to: day)[:totals]).to include(orders: 5, gross_minor: 218_080, refunds_minor: 19_280)
    end

    api_post "/api/v1/day_close/lock", { business_day: day.to_s, force: true }, headers: h
    expect(response).to have_http_status(:ok), response.body
    closed = within(biz) { DayClose.find_by!(branch_id: branch.id, business_day: day).summary }

    travel_to(Time.current + 1.day) do
      first = within(biz) { Order.where(branch_id: branch.id).order(:created_at).first }
      refund!({ id: first.id }, 5_000) # on the next day, the closed day stays as it was
      expect(within(biz) { Refund.order(:created_at).last.business_day }).to eq(day + 1)
      again = figures(day)
      expect(again[:revenue].values.uniq).to eq([ 198_800 ])
      expect(again[:tax].values.uniq).to eq([ 27_421 ])
      expect(closed).to include("net_sales_minor" => 198_800, "tax_minor" => 27_421)
      after = figures(day + 1)
      expect(after[:revenue].values.uniq).to eq([ -5_000 ]), after[:revenue].inspect
      expect(after[:tax].values.uniq).to eq([ -690 ]) # Rs 6.90 of the Rs 50 was tax
      expect(books(day + 1)).to include(tax: -690)
      expect(after[:pl][:net_profit_minor]).to eq(books(day + 1)[:earnings])
      both = figures(day, day + 1)
      expect(both[:revenue].values.uniq).to eq([ 193_800 ])
      expect(both[:pl][:net_profit_minor]).to eq(within(biz) { Finance::Statements.balance_sheet(as_of: day + 1)[:current_earnings_minor] })
    end
  end

  # reports#4: an order completed unpaid has no paid_at, so the hourly report put it at midnight. It is a sale (SPEC:
  # completed orders) that the journal does not hold until it is paid; the profit and loss keeps to the books and
  # shows the difference on the sales account.
  it "puts an order completed unpaid at the hour it was closed, and the profit and loss keeps to the books" do
    within(biz) { Setting.write!(biz, { "pos.order_behavior.direct_unpaid_orders" => true }) }
    complete!(order!([ { product_id: m[:burger].id } ]))
    within(biz) do
      expect(Order.last).to have_attributes(status: "closed", unpaid_direct: true, paid_at: nil)
      hour = Time.current.in_time_zone(branch.time_zone).hour
      expect(Reports::Sales.new(branch: branch, from: day, to: day).by_hour.find { |r| r[:hour] == hour }).to include(orders: 1, revenue_minor: 52_200)
      pl = Finance::ProfitLoss.run(branch: branch, from: day, to: day)
      expect(pl[:revenue]).to include(revenue_minor: 52_200, net_sales_minor: 45_000)
      expect(pl[:operating][:other]).to eq([ { code: "4000", name: "Sales Revenue", kind: "income", amount_minor: 45_000 } ])
      expect(pl[:net_profit_minor]).to eq(0)
      expect(pl[:books]).to include(net_minor: 0)
    end
  end

  # reports#8: the old rule ran a refunds subquery for every order row it summed.
  it "sums revenue without a refunds subquery per order" do
    pay!(order!([ { product_id: m[:burger].id } ]))
    sql = []
    callback = ->(*, payload) { sql << payload[:sql] }
    ActiveSupport::Notifications.subscribed(callback, "sql.active_record") do
      within(biz) do
        Reports::Sales.new(branch: branch, from: day, to: day).then { |s| [ s.overview, s.by_day, s.by_hour, s.cashiers ] }
        Reports::Dashboard.spec(branch, period: "30d")
      end
    end
    expect(sql.grep(/refunds\.order_id = orders\.id/i)).to be_empty
  end

  # reports#9: the branch's dashboard and its Valuation & COGS show its own stock, not every branch's.
  it "values only the branch's own stock on its dashboard and Valuation & COGS" do
    main = branch
    within(biz) do
      flour = StockItem.create!(name: "Flour", base_unit: Unit.find_by!(code: "pcs"))
      gulberg = Branch.create!(name: "Gulberg")
      receive = ->(b, qty) { Stock::Posting.post!(Stock::Posting.create!({ kind: "receive", to_section_id: StockSection.default_for(b).id }, lines: [ { stock_item_id: flour.id, quantity: qty, unit_cost_minor: 100 } ], actor: owner, branch: b), actor: owner) }
      receive.call(main, 10)
      receive.call(gulberg, 90)
      waste = Stock::Posting.create!({ kind: "waste", from_section_id: StockSection.default_for(gulberg).id, reason: "Damp" }, lines: [ { stock_item_id: flour.id, quantity: 100 } ], actor: owner, branch: gulberg)
      Stock::Posting.post!(waste, actor: owner) # Gulberg goes below zero
      expect(Reports::Dashboard.build(main)[:stock]).to include(value_minor: 1_000, negative_items: 0)
      expect(Reports::Dashboard.build(gulberg)[:stock]).to include(value_minor: -1_000, negative_items: 1)
      cogs = Reports::Stock.valuation_cogs(branch: main, from: day, to: day)
      expect(cogs[:stock_value_minor]).to eq(1_000)
      expect(cogs[:valuation].map { |r| r[:section][:branch_id] }.uniq).to eq([ main.id ])
    end
  end
end

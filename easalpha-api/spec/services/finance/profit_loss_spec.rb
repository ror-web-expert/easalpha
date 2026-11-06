require "rails_helper"

# Finance::ProfitLoss and the one revenue rule (review of 6 Nov 2026, R22). Its revenue comes from Reports::Revenue, so
# it is the sales report's figure for the same period, and its net sales and gross profit are the stock and branch
# reports' figures. A staff meal earns nothing (its menu price is no sale, and the tax its lines work out was never
# charged) while the bun it used stays in cost of goods.
RSpec.describe Finance::ProfitLoss, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:day) { today_for(biz) }

  before do
    within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      Unit.seed_defaults!
      pcs = Unit.find_by!(code: "pcs")
      bun = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: StockSection.default_for(branch).id }, lines: [ { stock_item_id: bun.id, quantity: 100, unit_cost_minor: 2_000 } ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      recipe = Recipe.create!(product: m[:burger], name: "Burger")
      recipe.lines.create!(stock_item: bun, unit: pcs, quantity: 1)
      Recipes::Costing.recompute!(recipe)
    end
  end

  def burger!(extra = {})
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o, tip: 0)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] + tip } ], tip_minor: tip }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def refund!(o, amount)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: "cash", reason: "cold" }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  it "says what the sales report says, with a staff meal at zero, its bun in cost of goods, and lines that add up to net sales" do
    pay!(burger!, tip: 5_000) # Rs 522 and a Rs 50 tip
    part = burger!
    pay!(part)
    refund!(part, 10_000) # Rs 422 stays
    gone = burger!
    pay!(gone)
    refund!(gone, gone[:total_minor]) # nothing stays
    meal = burger!(is_staff_meal: true, staff_meal_reason: "Kitchen lunch")
    api_post "/api/v1/orders/#{meal[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body

    within(biz) do
      pl = Finance::ProfitLoss.run(branch: branch, from: day, to: day)
      sales = Reports::Sales.new(branch: branch, from: day, to: day).overview
      expect(pl[:revenue][:revenue_minor]).to eq(sales[:revenue_minor])
      expect(pl[:orders]).to eq(sales[:orders])
      r = pl[:revenue]
      # Three burgers sold (Rs 450 and Rs 72 tax each); refunds take back their shares as the journal splits them: Rs
      # 86.21 of sales and Rs 13.79 of tax from the Rs 100, everything from the full one. The tip is the staff's.
      expect(r).to include(revenue_minor: 99_400, tax_collected_minor: 13_021, net_sales_minor: 81_379, gross_sales_minor: 135_000, discounts_minor: 0,
                           service_charge_minor: 0, delivery_charge_minor: 0, tips_minor: 5_000, rounding_minor: 0, refunds_minor: 53_621)
      expect(r[:gross_sales_minor] - r[:discounts_minor] + r[:service_charge_minor] + r[:delivery_charge_minor] + r[:rounding_minor] - r[:refunds_minor]).to eq(r[:net_sales_minor])
      expect(r[:net_sales_minor] + r[:tax_collected_minor] + r[:tips_minor]).to eq(r[:revenue_minor])
      # Three buns went out with a sale (the paid, the part-refunded and the staff meal); the refunded one came back.
      expect(pl).to include(cost_of_goods_minor: 6_000, gross_profit_minor: 75_379, net_profit_minor: 75_379)
      expect(Reports::Stock.valuation_cogs(branch: branch, from: day, to: day)).to include(revenue_minor: 81_379, cogs_minor: 6_000)
      expect(Reports::Branches.compare(from: day, to: day)[:rows].first).to include(revenue_minor: 99_400, cost_of_goods_minor: 6_000, gross_profit_minor: 75_379)
      expect(Finance::Statements.balance_sheet(as_of: day)[:current_earnings_minor]).to eq(pl[:net_profit_minor])
    end
  end

  # B14 with the books package (P2): a subsidised canteen meal books the company's share to 5170 Staff Meals, and the
  # payroll clears the worker's share into 5110 Salaries and moves the tips it pays out of Salaries into Tips Payable.
  # Those live only in the journal; the profit and loss lists them and still comes to the balance sheet's earnings.
  it "keeps to the books through a subsidised canteen meal and a payroll that clears it and pays out tips" do
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    kiosk, worker = within(biz) do
      lunch = MealSession.create!(branch: branch, name: "Lunch", starts_at: "00:00", ends_at: "23:59")
      Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: lunch, date: day, items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ]))
      [ Device.create!(branch: branch, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1"),
        Employee.create!(name: "Akbar Ali", base_salary_minor: 3_000_000, pay_frequency: "monthly", joined_on: Date.new(2026, 1, 1), fingerprint_id: "FP-001", fingerprint_enrolled: true, shares_tips: true) ]
    end
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body # Rs 522: Rs 200 the worker's, Rs 322 the company's
    pay!(burger!, tip: 5_000)
    month = day.beginning_of_month
    within(biz) { (month..month.end_of_month).each { |d| Attendance.create!(employee_id: worker.id, business_day: d, status: "present", source: "manual") } }
    api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m") }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:payslips].sole).to include(deductions_minor: 20_000, tips_minor: 5_000, net_minor: 2_985_000)
    api_post "/api/v1/payroll/runs/#{json[:id]}/pay", { method_code: "bank" }, headers: headers
    expect(response).to have_http_status(:ok), response.body

    within(biz) do
      # A day either side: the salary expense is dated by the calendar, the books by the business day.
      pl = Finance::ProfitLoss.run(branch: branch, from: day - 1, to: day + 1)
      expect(pl[:revenue]).to include(revenue_minor: 109_400, net_sales_minor: 90_000, tax_collected_minor: 14_400, tips_minor: 5_000)
      expect(pl[:operating][:expenses_minor]).to eq(2_985_000)
      expect(pl[:operating][:other].map { |o| o.values_at(:code, :amount_minor) }).to contain_exactly([ "5170", 32_200 ], [ "5110", 20_000 - 5_000 ])
      expect(pl[:net_profit_minor]).to eq(90_000 - 4_000 - 2_985_000 - 32_200 - 15_000)
      expect(pl[:net_profit_minor]).to eq(pl[:books][:net_minor])
      expect(pl[:net_profit_minor]).to eq(Finance::Statements.balance_sheet(as_of: day + 1)[:current_earnings_minor])
    end
  end

  # reports#6: a tax-inclusive price holds its tax, so the sale is what is left of it, as the journal books it.
  it "takes an inclusive tax out of the sale, as the journal does" do
    within(biz) { m[:chai].update!(tax_rate: TaxRate.create!(name: "PRA 16% incl", rate: 16, inclusive: true), base_price_minor: 11_600) }
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    pay!(json)
    within(biz) do
      pl = Finance::ProfitLoss.run(branch: branch, from: day, to: day)
      expect(pl[:revenue]).to include(revenue_minor: 11_600, gross_sales_minor: 10_000, net_sales_minor: 10_000, tax_collected_minor: 1_600)
      expect(pl[:operating][:other]).to be_empty
      expect(pl[:net_profit_minor]).to eq(Finance::Statements.balance_sheet(as_of: day)[:current_earnings_minor])
    end
  end
end

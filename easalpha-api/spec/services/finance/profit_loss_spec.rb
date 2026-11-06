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
      expect(r).to include(revenue_minor: 99_400, tax_collected_minor: 14_400, net_sales_minor: 85_000, gross_sales_minor: 90_000, discounts_minor: 0,
                           service_charge_minor: 0, delivery_charge_minor: 0, tips_minor: 5_000, rounding_minor: 0, refunds_minor: 10_000)
      expect(r[:gross_sales_minor] - r[:discounts_minor] + r[:service_charge_minor] + r[:delivery_charge_minor] + r[:tips_minor] + r[:rounding_minor] - r[:refunds_minor]).to eq(r[:net_sales_minor])
      # Three buns went out with a sale (the paid, the part-refunded and the staff meal); the refunded one came back.
      expect(pl).to include(cost_of_goods_minor: 6_000, gross_profit_minor: 79_000)
      expect(Reports::Stock.valuation_cogs(branch: branch, from: day, to: day)).to include(revenue_minor: 85_000, cogs_minor: 6_000)
      expect(Reports::Branches.compare(from: day, to: day)[:rows].first).to include(revenue_minor: 99_400, cost_of_goods_minor: 6_000, gross_profit_minor: 79_000)
    end
  end
end

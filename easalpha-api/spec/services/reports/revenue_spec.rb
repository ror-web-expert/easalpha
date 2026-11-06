require "rails_helper"

# One revenue rule for every report (6 Nov review, item E4; dating settled in the final round): a sale on its order's
# day, a refund on its own day, so on one day a fully refunded order comes to zero. The sales report, the dashboard,
# COGS, commissions and the branch comparison must all say the same number. The refunded order was still sold, so it
# counts as an order; commissions count only orders that stood.
RSpec.describe Reports::Revenue, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def paid_burger
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  def refund!(o, amount)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: "cash", reason: "cold" }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  it "counts a paid order in full, a partly refunded one net of the refund, and a fully refunded one as zero, everywhere" do
    paid_burger                       # Rs 522
    part = paid_burger
    refund!(part, 10_000)             # Rs 422 stays
    gone = paid_burger
    refund!(gone, gone[:total_minor]) # zero
    day = today_for(biz)
    within(biz) do
      expect(Order.find(gone[:id]).status).to eq("refunded")
      sales = Reports::Sales.new(branch: branch, from: day, to: day)
      expect(sales.overview).to include(orders: 3, revenue_minor: 94_400, refunds_minor: 62_200, average_order_minor: 31_466)
      expect(sales.by_day.first).to include(orders: 3, revenue_minor: 94_400)
      expect(sales.cashiers.sum { |r| r[:revenue_minor] }).to eq(94_400)
      expect(sales.by_hour.sum { |r| r[:revenue_minor] }).to eq(94_400)
      expect(Reports::Dashboard.spec(branch, period: "today")[:cards]).to include(total_revenue_minor: 94_400)
      expect(Reports::Dashboard.build(branch)[:today][:revenue_minor]).to eq(94_400)
      expect(Reports::Branches.compare(from: day, to: day)[:rows].first).to include(orders: 3, revenue_minor: 94_400)
      cashier = Reports::Commissions.run(branch: branch, from: day, to: day)[:rows].find { |r| r[:applies_to] == "cashier" }
      expect(cashier).to include(orders: 2, sales_minor: 94_400)
      # Net of the tax kept: Rs 72 on each sale, less the Rs 13.79 share of the Rs 100 refund and all of the full one's.
      expect(Reports::Stock.valuation_cogs(branch: branch, from: day, to: day)[:revenue_minor]).to eq(94_400 - 13_021)
    end
  end
end

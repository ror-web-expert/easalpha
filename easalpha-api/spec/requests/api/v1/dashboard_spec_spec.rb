require "rails_helper"

# SPEC "Dashboard and the business day": KPI cards scoped to a period, charts, top sellers, and the two top-bar pills.
RSpec.describe "SPEC dashboard", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }

  it "returns the cards, charts, top sellers and pills for today, and accepts other periods" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id, quantity: 2 } ], place: true }, headers: headers
    paid = json
    api_post "/api/v1/orders/#{paid[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: paid[:total_minor], tendered_minor: paid[:total_minor] } ] }, headers: headers
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    open = json
    get "/api/v1/reports/dashboard/spec", headers: headers
    expect(response).to have_http_status(:ok)
    c = json[:cards]
    expect(c[:total_products]).to eq(2)
    expect(c[:total_revenue_minor]).to eq(paid[:total_minor])
    expect(c[:incl_open_minor]).to eq(paid[:total_minor] + open[:total_minor])
    expect(c).to include(total_orders: 2, cancelled_orders: 0)
    expect(json[:charts][:sales_by_hour].size).to eq(24)
    expect(json[:charts][:order_status].map { |s| s[:status] }).to eq(%w[pending preparing ready dispatched completed cancelled])
    expect(json[:charts][:products_by_category].map { |x| x[:category] }).to match_array(%w[Mains Drinks])
    expect(json[:top_selling].first[:name]).to eq("Chai")
    expect(json[:pills]).to include(open_orders_today: 1, open_orders_previous: 0)
    get "/api/v1/reports/dashboard/spec?period=7d", headers: headers
    expect(json[:from]).to eq((Date.parse(json[:to]) - 6).iso8601)
    get "/api/v1/reports/dashboard/spec?period=custom&from=2020-01-01&to=2020-01-31", headers: headers
    expect(json[:cards][:total_orders]).to eq(0)
  end

  it "puts the pills on /me and counts low-stock items" do
    m
    get "/api/v1/me", headers: headers
    expect(json[:pills]).to include(open_orders_today: 0, low_stock_items: 0)
    within(biz) do
      Unit.seed_defaults!
      StockItem.create!(name: "Lemons", sku: "LEM", base_unit: Unit.find_by!(code: "pcs"), minimum_qty: 10)
    end
    get "/api/v1/me", headers: headers
    expect(json[:pills][:low_stock_items]).to eq(1)
  end

  it "needs a report or dashboard permission" do
    cashier = add_member!(biz, "waiter")
    get "/api/v1/reports/dashboard/spec", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end
end

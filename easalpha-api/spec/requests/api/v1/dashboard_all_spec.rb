require "rails_helper"

# Review 6 (17 Oct 2026): the admin dashboard loads its cards and extras in one call, cached per business, branch,
# business day and period; a new order changes the key, so the cache never hides a sale.
RSpec.describe "Dashboard in one call", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }
  let(:store) { ActiveSupport::Cache::MemoryStore.new }

  before { allow(Rails).to receive(:cache).and_return(store) }

  def sell!
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    o
  end

  it "returns the spec cards and the extras together, the same figures as the two separate endpoints" do
    sell!
    get "/api/v1/reports/dashboard/all", headers: headers
    expect(response).to have_http_status(:ok), response.body
    all = json
    get "/api/v1/reports/dashboard/spec", headers: headers
    expect(all[:spec][:cards]).to eq(json[:cards])
    get "/api/v1/reports/dashboard", headers: headers
    expect(all[:extras][:khata_outstanding_minor]).to eq(json[:khata_outstanding_minor])
    expect(all[:extras][:business_day]).to eq(json[:business_day])
  end

  it "serves a repeat from the cache, and a new sale shows at once" do
    first = sell!
    get "/api/v1/reports/dashboard/all", headers: headers
    expect(json[:spec][:cards][:total_orders]).to eq(1)
    expect(Reports::Dashboard).not_to receive(:spec)
    get "/api/v1/reports/dashboard/all", headers: headers
    expect(json[:spec][:cards][:total_orders]).to eq(1)
    RSpec::Mocks.space.proxy_for(Reports::Dashboard).reset
    sell!
    get "/api/v1/reports/dashboard/all", headers: headers
    expect(json[:spec][:cards][:total_orders]).to eq(2)
    expect(json[:spec][:cards][:total_revenue_minor]).to eq(first[:total_minor] * 2)
  end

  it "sends Timing-Allow-Origin so the web app can measure API responses" do
    get "/api/v1/reports/dashboard/all", headers: headers
    expect(response.headers["timing-allow-origin"]).to include("http://localhost:3000")
  end
end

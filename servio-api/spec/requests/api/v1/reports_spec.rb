require "rails_helper"

RSpec.describe "Reports and dashboard", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  def sell(lines:, as: headers, at: nil, discount: nil)
    api_post "/api/v1/orders", { order_type: "walk_in", client_created_at: at&.iso8601, lines: lines, place: true }, headers: as
    oid = json[:id]
    api_post "/api/v1/orders/#{oid}/discounts", { kind: "percent", value: discount, reason: "Promo" }, headers: headers if discount
    api_post "/api/v1/orders/#{oid}/payments", { payments: [ { method_code: "cash", amount_minor: json[:total_minor] || json[:order][:total_minor] } ] }, headers: as
    within(biz) { Order.where(id: oid).update_all(paid_at: at) } if at
    oid
  end

  before do
    cashier
    sell(lines: [ { product_id: m[:burger].id } ], as: auth_headers(cashier))                      # 52,200 today
    sell(lines: [ { product_id: m[:chai].id, quantity: 2 } ], discount: 10)                         # 18,560 - 1,856 = 16,704 incl tax: subtotal 16,000 -1,600 => 14,400 + 2,304 = 16,704
    sell(lines: [ { product_id: m[:chai].id } ], at: 7.days.ago)                                    # 9,280 same day last week
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    @open = json[:id]
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/void", { reason: "Mistake" }, headers: headers
  end

  it "builds the dashboard with today, last week, open orders and attention items" do
    get "/api/v1/reports/dashboard", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:today][:orders]).to eq(2)
    expect(json[:today][:revenue_minor]).to eq(52_200 + 16_704)
    expect(json[:same_day_last_week][:revenue_minor]).to eq(9_280)
    expect(json[:open_orders]).to eq(1)
    expect(json[:open_minor]).to eq(9_280)
    expect(json[:today][:voided]).to eq(1)
    expect(json[:top_items].first[:name]).to eq("Zinger Burger")
    expect(json[:trend_7_days].size).to be >= 1
    expect(json[:checklist].find { |c| c[:key] == "first_order" }[:done]).to be true
  end

  it "reports sales by day, hour, item, category, cashier and payment method for a range" do
    today = within(biz) { Branch.first.business_day_for(Time.current) }
    get "/api/v1/reports/overview?from=#{today - 7}&to=#{today}", headers: headers
    expect(json[:orders]).to eq(3)
    expect(json[:revenue_minor]).to eq(52_200 + 16_704 + 9_280)
    expect(json[:discount_minor]).to eq(1_600)
    expect(json[:by_payment_method][:cash]).to eq(52_200 + 16_704 + 9_280)
    get "/api/v1/reports/by_day?from=#{today - 7}&to=#{today}", headers: headers
    expect(json[:data].size).to eq(2)
    get "/api/v1/reports/items", headers: headers
    expect(json[:data].map { |i| i[:name] }).to eq([ "Zinger Burger", "Chai" ])
    expect(json[:data].last[:quantity]).to eq(2.0)
    get "/api/v1/reports/categories", headers: headers
    expect(json[:data].map { |c| c[:name] }).to match_array(%w[Mains Drinks])
    get "/api/v1/reports/cashiers", headers: headers
    expect(json[:data].size).to eq(2)
    get "/api/v1/reports/by_hour", headers: headers
    expect(json[:data].size).to eq(24)
    expect(json[:data].sum { |h| h[:orders] }).to eq(2)
  end

  it "lists voids and discounts with who did them, and the grand report in one call" do
    get "/api/v1/reports/voids", headers: headers
    expect(json[:count]).to eq(1)
    expect(json[:rows].first).to include(reason: "Mistake", stock_action: "returned")
    get "/api/v1/reports/discounts", headers: headers
    expect(json[:count]).to eq(1)
    expect(json[:amount_minor]).to eq(1_600)
    get "/api/v1/reports/grand", headers: headers
    expect(json[:overview][:orders]).to eq(2)
    expect(json[:items].size).to eq(2)
  end

  it "restricts a cashier to own data and rejects a bad range" do
    get "/api/v1/reports/overview", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/reports/dashboard", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/reports/overview?from=2020-01-01&to=2026-01-01", headers: headers
    expect(response).to have_http_status(:bad_request)
    get "/api/v1/reports/overview?from=yesterday", headers: headers
    expect(response).to have_http_status(:bad_request)
  end
end

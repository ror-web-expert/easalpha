require "rails_helper"

# Order items of the 6 Nov 2026 review: a coupon applied twice, the order of mixed discounts, and a dispatched
# delivery that the till saves before paying and that reopens as served.
RSpec.describe "Orders review: coupons, discounts, dispatched deliveries", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  it "applies a coupon once per order" do
    api_post "/api/v1/promotions", { name: "Eid", kind: "coupon", value: 10, coupon_code: "eid10" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ] }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/discounts", { coupon_code: "eid10" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:discount_minor]).to eq(4_500)
    api_post "/api/v1/orders/#{o[:id]}/discounts", { coupon_code: "EID10" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("discount.applied")
    get "/api/v1/orders/#{o[:id]}", headers: headers
    expect(json[:discount_minor]).to eq(4_500)
    expect(json[:discounts].size).to eq(1)
    within(biz) { expect(Promotion.find_by!(coupon_code: "EID10").units_sold).to eq(1) }
  end

  it "prices mixed fixed and percent discounts in the order they were applied, on every recalculation" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ] }, headers: headers # 45,000 before tax
    o = json
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "fixed", value: 50, reason: "Staff friend" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 10, reason: "Promo" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:discount_minor]).to eq(5_000 + 4_000) # Rs 50 off, then 10% of the Rs 400 left
    3.times do
      api_patch "/api/v1/orders/#{o[:id]}", { notes: "again #{SecureRandom.hex(2)}" }, headers: headers
      expect(json[:discount_minor]).to eq(9_000)
    end
    within(biz) { expect(Order.find(o[:id]).discounts.map(&:kind)).to eq(%w[fixed percent]) }
  end

  it "lets the till save a dispatched delivery before paying it, and reopens it as served" do
    api_post "/api/v1/customers", { name: "Hafsa", phone: "03247932270" }, headers: headers
    cust = json[:id]
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/serve", {}, headers: headers
    expect(json[:status]).to eq("dispatched")
    line = json[:items].first
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 1 } ], notes: "ring the bell" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("dispatched")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:order][:status]).to eq("paid")
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("served")
  end
end

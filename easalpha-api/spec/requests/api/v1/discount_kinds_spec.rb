require "rails_helper"

# POST /orders/:id/discounts takes by hand only what a cashier can give: a percent or an amount, weighed against the
# role's limit or a manager's PIN (leftovers of 7 Nov 2026, L1 item 5). A "promotion" with no coupon was priced as a
# percent but weighed as an amount, so a cashier with a 10% limit took 50% off a Rs 1,350 order with no PIN; points,
# vouchers and the regular discount could be typed in as kinds too. They keep their own paths: a coupon code, a
# voucher code, redeem_points and the server's recency tiers.
RSpec.describe "Discount kinds given by hand", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def h = auth_headers(owner)

  def place!(customer_id: nil)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [ { product_id: m[:burger].id, quantity: 3 } ], place: true }, headers: pos
    expect(response).to have_http_status(:created), response.body
    json
  end

  def discount!(o, **body)
    api_post "/api/v1/orders/#{o[:id]}/discounts", { reason: "Regular guest" }.merge(body), headers: pos
  end

  it "refuses a kind other than a percent or an amount, so a cashier's limit holds" do
    o = place!                                                           # Rs 1,350 before tax
    discount!(o, kind: "promotion", value: 50)
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:code]).to eq("discount.kind")
    %w[loyalty voucher regular bogus].each do |kind|
      discount!(o, kind: kind, value: 10)
      expect(response).to have_http_status(:unprocessable_content), kind
    end
    get "/api/v1/orders/#{o[:id]}", headers: pos
    expect(json).to include(discount_minor: 0, total_minor: o[:total_minor], discounts: [])

    discount!(o, kind: "percent", value: 50)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:details][:permissions]).to eq([ "discounts.above_limit" ])
    discount!(o, kind: "percent", value: 50, approver_pin: "9999", approval_codes: [ "discounts.above_limit" ])
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(discount_minor: 67_500)
    o2 = place!
    discount!(o2, kind: "fixed", value: 100)                             # Rs 100 of Rs 1,350, inside the 10%
    expect(response).to have_http_status(:ok), response.body
    expect(json[:discounts].map { |d| [ d[:kind], d[:amount_minor] ] }).to eq([ [ "fixed", 10_000 ] ])
  end

  it "still gives coupons, vouchers, points and the regular discount through their own paths" do
    api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true }, headers: h
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: h
    sara = within(biz) { Customer.create!(name: "Sara", phone: "+923001112233", last_order_at: 1.day.ago, loyalty_points: 500) }
    within(biz) { Promotion.create!(name: "Ten off", kind: "coupon", value: 10, coupon_code: "TENOFF", valid_from: 1.hour.ago, valid_to: 7.days.from_now) }
    api_post "/api/v1/voucher_batches", { name: "Eid gift", kind: "personal", value_kind: "fixed", value: 100 }, headers: h
    api_post "/api/v1/voucher_batches/#{json[:id]}/issue", { customer_ids: [ sara.id ], send: false }, headers: h
    code = json[:data].first[:code]

    o = place!(customer_id: sara.id)
    expect(o[:discounts].map { |d| d[:kind] }).to eq([ "regular" ])
    discount!(o, kind: "promotion", coupon_code: "TENOFF")
    expect(response).to have_http_status(:ok), response.body
    discount!(o, voucher_code: code)
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/orders/#{o[:id]}/redeem_points", { points: 100 }, headers: pos
    expect(response).to have_http_status(:ok), response.body
    expect(json[:discounts].map { |d| d[:kind] }).to eq(%w[regular promotion voucher loyalty])
  end
end

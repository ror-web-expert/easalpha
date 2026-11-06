require "rails_helper"

# Paying or completing an order is not cooking it (QA F2: a takeaway paid at once was marked served and never reached
# the kitchen display; the SPEC keeps the payment status apart from the order's). And a staff meal completed online had
# no receipt number or paid_at, so its receipt printed as a BILL with no barcode (review orders-money#6, QA T13).
RSpec.describe "Paid orders in the kitchen, and the receipt of a completed staff meal", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) } # the burger cooks at Grill, the chai at Drinks
  let(:headers) { auth_headers(owner) }
  let(:kds) { within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current) } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def paid_takeaway!(**extra)
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:burger].id }, { product_id: m[:chai].id } ], place: true }.merge(extra), headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(json[:order]).to include(status: "paid", payment_status: "paid")
    json[:order]
  end

  def kitchen(station = nil)
    get "/api/v1/kitchen/orders", params: { station_id: station }.compact, headers: device_headers(kds)
    expect(response).to have_http_status(:ok)
    json[:data]
  end

  it "keeps an order paid at once on the kitchen display, per station, until the kitchen bumps it" do
    o = paid_takeaway!
    expect(kitchen.map { |k| [ k[:id], k[:status], k[:items].map { |i| i[:status] } ] }).to eq([ [ o[:id], "paid", %w[sent sent] ] ])
    expect(kitchen(m[:grill].id).first[:items].map { |i| i[:name] }).to eq([ "Zinger Burger" ])
    expect(kitchen(m[:drinks].id).first[:items].map { |i| i[:name] }).to eq([ "Chai" ])

    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(status: "paid", payment_status: "paid")
    expect(json[:ready_at]).to be_present
    expect(json[:items].map { |i| i[:status] }).to eq(%w[ready ready])
    expect(kitchen).to be_empty
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds) # a second press changes nothing
    expect(json).to include(status: "paid", ready_at: be_present)
  end

  it "takes a paid order off the display once its last line is bumped, and leaves it paid" do
    o = paid_takeaway!
    burger, chai = kitchen.first[:items].partition { |i| i[:name] == "Zinger Burger" }.map(&:first)
    api_post "/api/v1/kitchen/items/#{burger[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(kitchen.map { |k| k[:id] }).to eq([ o[:id] ])
    api_post "/api/v1/kitchen/items/#{chai[:id]}/bump", {}, headers: device_headers(kds)
    expect(json).to include(status: "paid", ready_at: be_present)
    expect(kitchen).to be_empty
    within(biz) { expect(Order.find(o[:id])).to have_attributes(status: "paid", payment_status: "paid") }
  end

  it "keeps a staff meal completed online on the display too, with a receipt number and paid_at" do
    api_post "/api/v1/orders", { order_type: "takeaway", is_staff_meal: true, staff_meal_reason: "Kitchen lunch", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    branch_code = within(biz) { Branch.first.code }
    expect(json).to include(status: "closed", payment_status: "paid", receipt_number: "#{today_for(biz).strftime('%y%m%d')}-#{branch_code}-#{o[:serial]}")
    expect(json[:paid_at]).to be_present
    get "/api/v1/orders/#{o[:id]}/receipt", headers: headers
    expect(json).to include(receipt_number: be_present)
    expect(json[:order]).to include(paid_at: be_present, is_staff_meal: true)
    expect(kitchen.map { |k| k[:id] }).to eq([ o[:id] ])
  end

  it "never puts a canteen meal on the display: it is served at the counter" do
    api_post "/api/v1/orders", { order_type: "takeaway", source: "kiosk", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(json[:order][:items].map { |i| i[:status] }).to eq([ "served" ])
    expect(kitchen).to be_empty
  end
end

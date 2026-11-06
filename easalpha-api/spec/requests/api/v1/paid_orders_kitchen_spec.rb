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

  it "keeps a paid order reopened while it cooks on the display, and shows a line added to a served order until it is bumped" do
    o = paid_takeaway!
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    expect(json[:status]).to eq("served")
    expect(kitchen.map { |k| [ k[:id], k[:status] ] }).to eq([ [ o[:id], "served" ] ])
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("served")
    expect(kitchen).to be_empty

    api_post "/api/v1/orders", { order_type: "dine_in", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    dine = json
    api_post "/api/v1/orders/#{dine[:id]}/serve", {}, headers: headers
    expect(kitchen.map { |k| k[:id] }).to eq([]) # served, nothing left to cook
    api_patch "/api/v1/orders/#{dine[:id]}", { lines: [ { id: dine[:items].first[:id], quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
    expect(kitchen.map { |k| [ k[:id], k[:items].map { |i| [ i[:name], i[:status] ] } ] }).to eq([ [ dine[:id], [ [ "Zinger Burger", "served" ], [ "Chai", "sent" ] ] ] ])
    chai = kitchen.first[:items].find { |i| i[:name] == "Chai" }
    api_post "/api/v1/kitchen/items/#{chai[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("served")
    expect(kitchen).to be_empty
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

  it "keeps canteen meals off the display: paid or free, they are handed over at the counter" do
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    kiosk = within(biz) { Device.create!(branch: Branch.first, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1") }
    # All day from the day end: a session opening before 02:01 belongs to the previous business day (canteen package).
    lunch = within(biz) { MealSession.create!(branch: Branch.first, name: "Lunch", starts_at: "02:01", ends_at: "02:00") }
    water = within(biz) { Product.create!(category: m[:chai].category, name: "Water", base_price_minor: 0) }
    %w[FP-001 FP-002].each_with_index do |fp, i|
      within(biz) { Employee.create!(name: "Worker #{i}", base_salary_minor: 3_000_000, pay_frequency: "monthly", fingerprint_id: fp, fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current) }
    end
    api_post "/api/v1/canteen/plans", { meal_session_id: lunch.id, plan_date: today_for(biz).to_s, publish: true,
                                        items: [ { product_id: m[:burger].id, planned_qty: 10, worker_price_minor: 20_000 }, { product_id: water.id, planned_qty: 10 } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    burger_item, water_item = json[:items].partition { |i| i[:product_id] == m[:burger].id }.map(&:first)
    claims = [ [ "FP-001", burger_item ], [ "FP-002", water_item ] ].map do |fp, item|
      api_post "/api/v1/canteen/claims", { id: SecureRandom.uuid, fingerprint_id: fp, meal_plan_item_id: item[:id] }, headers: device_headers(kiosk)
      expect(response).to have_http_status(:created), response.body
      json
    end
    claims.each do |c|
      api_post "/api/v1/canteen/claims/#{c[:id]}/serve", {}, headers: device_headers(kiosk)
      expect(response).to have_http_status(:ok), response.body
    end
    within(biz) { expect(Order.where(id: claims.map { |c| c[:order_id] }).map(&:status)).to eq(%w[closed closed]) }
    expect(kitchen).to be_empty
  end
end

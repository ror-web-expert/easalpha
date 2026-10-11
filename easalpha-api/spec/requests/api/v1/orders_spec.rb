require "rails_helper"

RSpec.describe "Orders and kitchen", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }

  def burger_line(qty: 1, extra: {})
    { product_id: m[:burger].id, quantity: qty, modifiers: [ { modifier_id: m[:hot].id } ] }.merge(extra)
  end

  it "prices a walk-in order with modifiers and exclusive tax, then places it with a daily serial and kitchen tickets per station" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ burger_line(qty: 2), { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    o = json
    expect(o[:status]).to eq("draft")
    expect(o[:subtotal_minor]).to eq(2 * (45_000 + 2_000) + 8_000)   # 102,000
    expect(o[:tax_minor]).to eq((94_000 * 0.16).round + (8_000 * 0.16).round) # 15,040 + 1,280
    expect(o[:total_minor]).to eq(102_000 + 16_320)
    expect(o[:items].first[:name]).to eq("Zinger Burger")
    expect(o[:items].first[:modifiers].first[:name]).to eq("Extra hot")

    api_post "/api/v1/orders/#{o[:id]}/place", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("placed")
    expect(json[:serial]).to eq(1)
    expect(json[:label]).to eq("#1")
    expect(json[:business_day]).to be_present
    expect(json[:items].map { |i| i[:status] }.uniq).to eq([ "sent" ])
    within(biz) do
      tickets = KitchenTicket.where(order_id: o[:id])
      expect(tickets.map(&:station_id)).to match_array([ m[:grill].id, m[:drinks].id ])
      expect(tickets.find_by(station_id: m[:grill].id).lines.first["modifiers"]).to eq([ "Extra hot" ])
    end

    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    expect(json[:serial]).to eq(2)
  end

  it "uses the delivery price, the variant price and inclusive tax correctly" do
    api_post "/api/v1/orders", { order_type: "delivery", lines: [ { product_id: m[:burger].id }, { product_id: m[:burger].id, variant_id: m[:double].id } ] }, headers: headers
    items = json[:items]
    expect(items[0][:unit_price_minor]).to eq(50_000)
    expect(items[1][:unit_price_minor]).to eq(65_000)
    expect(items[1][:name]).to eq("Zinger Burger (Double)")
    within(biz) { m[:tax].update!(inclusive: true) }
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: headers
    expect(json[:subtotal_minor]).to eq(8_000)
    expect(json[:tax_minor]).to eq(1_103)
    expect(json[:total_minor]).to eq(8_000)
  end

  it "applies service charge to dine-in from business settings and a deal as one line with components" do
    within(biz) { biz.update!(settings: { "service_charge_percent" => 10 }) }
    api_post "/api/v1/orders", { order_type: "dine_in", lines: [ { deal_id: m[:deal].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:items].first[:deal_components].map { |c| c[:name] }).to match_array([ "Zinger Burger", "Chai" ])
    expect(json[:subtotal_minor]).to eq(50_000)
    expect(json[:service_charge_minor]).to eq(5_000)
    expect(json[:total_minor]).to eq(50_000 + 8_000 + 5_000)
  end

  it "is idempotent on the client-generated id and keeps the till serial" do
    id = SecureRandom.uuid
    payload = { id: id, till_serial: "T1-059", order_type: "walk_in", client_created_at: 2.minutes.ago.iso8601, lines: [ { product_id: m[:chai].id } ], place: true }
    api_post "/api/v1/orders", payload, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:till_serial]).to eq("T1-059")
    expect(json[:serial]).to eq(1)
    api_post "/api/v1/orders", payload, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:id]).to eq(id)
    within(biz) { expect(Order.count).to eq(1) }
  end

  it "edits after sending: added items get a changed ticket, removed items a cancelled ticket" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    chai_line_id = o[:items].first[:id]
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { product_id: m[:burger].id } ] }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:items].map { |i| [ i[:name], i[:status] ] }).to match_array([ [ "Chai", "cancelled" ], [ "Zinger Burger", "sent" ] ])
    expect(json[:total_minor]).to eq(45_000 + 7_200)
    within(biz) { expect(KitchenTicket.where(order_id: o[:id]).pluck(:kind)).to match_array(%w[new changed cancelled]) }
    expect(chai_line_id).to be_present
  end

  it "kitchen: start, bump per item, order becomes ready, token list shows it, serve clears it" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id }, { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    kitchen = within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current) }
    get "/api/v1/kitchen/orders?station_id=#{m[:grill].id}", headers: device_headers(kitchen)
    expect(response).to have_http_status(:ok)
    expect(json[:data].size).to eq(1)
    expect(json[:data].first[:items].map { |i| i[:name] }).to eq([ "Zinger Burger" ])
    grill_item = json[:data].first[:items].first[:id]
    api_post "/api/v1/kitchen/items/#{grill_item}/bump", {}, headers: device_headers(kitchen)
    expect(json[:status]).to eq("preparing")
    chai_item = json[:items].find { |i| i[:name] == "Chai" }[:id]
    api_post "/api/v1/kitchen/items/#{chai_item}/bump", {}, headers: device_headers(kitchen)
    expect(json[:status]).to eq("ready")
    get "/api/v1/kitchen/ready", headers: device_headers(kitchen)
    expect(json[:data].map { |r| r[:serial] }).to eq([ 1 ])
    api_post "/api/v1/orders/#{o[:id]}/serve", {}, headers: headers
    expect(json[:status]).to eq("served")
    get "/api/v1/kitchen/ready", headers: device_headers(kitchen)
    expect(json[:data]).to be_empty
  end

  it "voids with a reason, needs a manager PIN for a cashier, and records the stock action" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: auth_headers(cashier)
    o = json
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Customer left" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("approval.required")
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Customer left", approver_pin: "9999" }, headers: auth_headers(cashier)
    manager
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Customer left", approver_pin: "9999" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("voided")
    expect(json[:voids].first[:stock_action]).to eq("returned")
    expect(json[:voids].first[:approved_by_membership_id]).to eq(manager.id)
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "again" }, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/void", { reason: "" }, headers: headers
    expect(response).to have_http_status(:bad_request)
  end

  it "limits discounts by role and allocates an order discount across lines before tax" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id }, { product_id: m[:chai].id } ] }, headers: auth_headers(cashier)
    o = json
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 10, reason: "Regular" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
    expect(json[:discount_minor]).to eq(5_300)
    expect(json[:items].map { |i| i[:line_discount_minor] }).to eq([ 4_500, 800 ])
    expect(json[:tax_minor]).to eq(((45_000 - 4_500) * 0.16).round + ((8_000 - 800) * 0.16).round)
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 25, reason: "Friend" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    manager
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 25, reason: "Friend", approver_pin: "9999" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
    expect(json[:discounts].last[:approved_by_membership_id]).to eq(manager.id)
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 5 }, headers: headers
    expect(response).to have_http_status(:bad_request)
    expect(json[:error][:code]).to eq("discount.reason_required")
  end

  it "applies a coupon promotion and counts units sold" do
    within(biz) { Promotion.create!(name: "Eid", kind: "coupon", value: 20, coupon_code: "EID20", unit_limit: 1) }
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/discounts", { coupon_code: "eid20" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:discount_minor]).to eq(1_600)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/discounts", { coupon_code: "eid20" }, headers: headers
    expect(response).to have_http_status(:conflict)
  end

  it "gates open items, price overrides and staff meals behind permissions or a manager PIN" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { open_item: { name: "Special", price_minor: 1_000 } } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    manager
    api_post "/api/v1/orders", { order_type: "walk_in", approver_pin: "9999", lines: [ { open_item: { name: "Special", price_minor: 1_000 } }, { product_id: m[:chai].id, price_override_minor: 5_000 } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:items].map { |i| i[:unit_price_minor] }).to eq([ 1_000, 5_000 ])
    expect(json[:items].last[:price_overridden]).to be true
    api_post "/api/v1/orders", { order_type: "walk_in", is_staff_meal: true, staff_meal_reason: "Chef lunch", lines: [ { product_id: m[:chai].id } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/orders", { order_type: "walk_in", is_staff_meal: true, staff_meal_reason: "Chef lunch", approver_pin: "9999", lines: [ { product_id: m[:chai].id } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:total_minor]).to eq(0)
    expect(json[:is_staff_meal]).to be true
  end

  it "holds and resumes a draft, assigns and releases a table, and summarises the day" do
    table = within(biz) { DiningTable.create!(branch: Branch.first, code: "T1", seats: 4) }
    api_post "/api/v1/orders", { order_type: "dine_in", table_id: table.id, lines: [ { product_id: m[:chai].id } ] }, headers: headers
    o = json
    expect(json[:table_code]).to eq("T1")
    within(biz) { expect(table.reload.status).to eq("occupied") }
    api_post "/api/v1/orders", { order_type: "dine_in", table_id: table.id, lines: [ { product_id: m[:chai].id } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/orders/#{o[:id]}/hold", {}, headers: headers
    expect(json[:status]).to eq("held")
    api_post "/api/v1/orders/#{o[:id]}/resume", {}, headers: headers
    expect(json[:status]).to eq("draft")
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Left" }, headers: headers
    within(biz) { expect(table.reload.status).to eq("available") }
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    get "/api/v1/orders/summary", headers: headers
    expect(json[:orders]).to eq(2)
    expect(json[:open_orders]).to eq(1)
    expect(json[:voided_orders]).to eq(1)
    expect(json[:open_minor]).to eq(9_280)
    get "/api/v1/orders?open=true", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/orders?q=%231", headers: headers
    expect(json[:data].first[:serial]).to eq(1)
  end

  it "resets serials per business day and per branch" do
    b2 = within(biz) { Branch.create!(name: "DHA", code: "B2") }
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    expect(json[:serial]).to eq(1)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers.merge("X-Branch-Id" => b2.id)
    expect(json[:serial]).to eq(1)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true, client_created_at: 2.days.ago.iso8601 }, headers: headers
    expect(json[:serial]).to eq(1)
    expect(json[:business_day]).to eq(within(biz) { Branch.first.business_day_for(2.days.ago) }.to_s)
  end

  it "requires the till permission and isolates tenants" do
    kitchen_user = add_member!(biz, "kitchen")
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: auth_headers(kitchen_user)
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ] }, headers: headers
    id = json[:id]
    other = signup_business(name: "Other")
    get "/api/v1/orders/#{id}", headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
    api_post "/api/v1/orders/#{id}/void", { reason: "x" }, headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
  end
end

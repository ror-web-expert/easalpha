require "rails_helper"

RSpec.describe "Expenses, overheads, delivery and riders", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def cash_balance = within(biz) { PaymentAccount.find_by!(kind: "cash").reload.current_balance_minor }

  it "records expenses in seeded categories, posts them to the cash account, voids by reversal, and summarises with overheads" do
    get "/api/v1/expenses/categories", headers: headers
    expect(json[:data].map { |c| c[:name] }).to include("Utilities", "Transport")
    gas = json[:data].find { |c| c[:name] == "Utilities" }[:children].find { |c| c[:name] == "Gas" }
    api_post "/api/v1/expenses", { category_id: gas[:id], amount_minor: 350_000, method_code: "cash", paid_to: "SSGC", note: "October bill" }, headers: headers
    expect(response).to have_http_status(:created)
    e1 = json
    expect(e1[:label]).to eq("EXP-1")
    expect(e1[:category]).to eq("Utilities / Gas")
    expect(cash_balance).to eq(-350_000)
    api_post "/api/v1/expenses", { category_id: gas[:id], amount_minor: 10_000, method_code: "khata" }, headers: headers
    expect(response).to have_http_status(:bad_request)
    api_post "/api/v1/expenses", { category_id: gas[:id], amount_minor: 5_000, method_code: "cash", client_id: "22222222-2222-2222-2222-222222222222" }, headers: headers
    api_post "/api/v1/expenses", { category_id: gas[:id], amount_minor: 5_000, method_code: "cash", client_id: "22222222-2222-2222-2222-222222222222" }, headers: headers
    expect(within(biz) { Expense.count }).to eq(2)
    api_post "/api/v1/overheads", { name: "Rent", kind: "rent", amount_minor: 3_000_000, basis: "per_month" }, headers: headers
    api_post "/api/v1/overheads", { name: "Labour", kind: "labor", amount_minor: 5_000, basis: "per_order" }, headers: headers
    expect(response).to have_http_status(:created)
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
    get "/api/v1/expenses/summary?from=#{Date.current}&to=#{Date.current}", headers: headers
    expect(json[:total_minor]).to eq(355_000)
    expect(json[:by_category].first[:category]).to eq("Utilities")
    expect(json[:paid_orders]).to eq(1)
    expect(json[:overheads].map { |o| o[:allocated_minor] }).to contain_exactly(100_000, 5_000)
    expect(json[:cost_per_order_minor]).to eq(355_000 + 105_000)
    api_post "/api/v1/expenses/#{e1[:id]}/void", { reason: "Duplicate" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:voided_at]).to be_present
    expect(cash_balance).to eq(-5_000 + 9_280)
    get "/api/v1/expenses?from=#{Date.current}&to=#{Date.current}", headers: headers
    expect(json[:data].size).to eq(1)
  end

  it "creates a delivery with the zone charge, assigns a rider, walks the status chips, and delivered never closes the order" do
    api_post "/api/v1/delivery_zones", { name: "DHA", areas: [ "DHA", "Phase 5" ], charge_minor: 15_000, min_order_minor: 50_000, eta_minutes: 40 }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/delivery_zones/quote?text=House 12, Phase 5, DHA Lahore", headers: headers
    expect(json[:charge_minor]).to eq(15_000)
    api_post "/api/v1/customers", { name: "Hira", phone: "03005556677", addresses: [ { line1: "House 12", area: "Phase 5 DHA", is_default: true } ] }, headers: headers
    cust = json
    api_post "/api/v1/riders", { name: "Bilal", phone: "03111111111", vehicle: "bike", create_login: true, pin: "4321" }, headers: headers
    expect(response).to have_http_status(:created)
    rider = json
    expect(rider[:membership_id]).to be_present
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust[:id], address_id: cust[:addresses].first[:id], delivery_charge_minor: 15_000, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created)
    order = json
    get "/api/v1/orders/#{order[:id]}/delivery", headers: headers
    expect(json[:status]).to eq("unassigned")
    expect(json[:zone_name]).to eq("DHA")
    expect(json[:charge_minor]).to eq(15_000)
    get "/api/v1/deliveries?open=true", headers: headers
    expect(json[:data].size).to eq(1)
    api_post "/api/v1/orders/#{order[:id]}/delivery/assign", { rider_id: rider[:id] }, headers: headers
    expect(json[:status]).to eq("assigned")
    expect(json[:rider_name]).to eq("Bilal")
    get "/api/v1/orders/#{order[:id]}", headers: headers
    expect(json[:rider_id]).to eq(rider[:id])

    rider_m = within(biz) { Membership.find(rider[:membership_id]) }
    rh = auth_headers(rider_m, app: "rider")
    get "/api/v1/rider/deliveries", headers: rh
    expect(json[:data].size).to eq(1)
    did = json[:data].first[:id]
    api_post "/api/v1/rider/deliveries/#{did}/status", { status: "picked_up", lat: 31.47, lng: 74.41 }, headers: rh
    expect(response).to have_http_status(:ok)
    expect(json[:order_status]).to eq("dispatched")
    api_post "/api/v1/rider/deliveries/#{did}/status", { status: "assigned" }, headers: rh
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/rider/deliveries/#{did}/status", { status: "on_the_way" }, headers: rh
    api_post "/api/v1/rider/deliveries/#{did}/status", { status: "arrived" }, headers: rh
    api_post "/api/v1/rider/deliveries/#{did}/status", { status: "delivered", cash_collected_minor: order[:total_minor] }, headers: rh
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("delivered")
    expect(json[:events].map { |e| e[:status] }).to eq(%w[assigned picked_up on_the_way arrived delivered])
    get "/api/v1/orders/#{order[:id]}", headers: headers
    expect(json[:status]).to eq("dispatched")
    expect(json[:payment_status]).not_to eq("paid")
    get "/api/v1/riders", headers: headers
    expect(json[:data].first[:status]).to eq("available")
    get "/api/v1/rider/deliveries", headers: headers
    expect(response).to have_http_status(:forbidden)
  end

  it "runs the rider cash float: issue, spend as an expense, return, statement and settlement with a shortfall alert" do
    api_post "/api/v1/riders", { name: "Asad", phone: "03122222222" }, headers: headers
    rider = json
    api_post "/api/v1/riders/#{rider[:id]}/float", { kind: "issue", amount_minor: 200_000, reason: "Morning float" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:rider][:float_minor]).to eq(200_000)
    expect(cash_balance).to eq(-200_000)
    api_post "/api/v1/riders/#{rider[:id]}/float", { kind: "spend", amount_minor: 30_000, reason: "Petrol" }, headers: headers
    expect(json[:rider][:float_minor]).to eq(170_000)
    expect(within(biz) { Expense.where(source: "rider_float").sum(:amount_minor) }).to eq(30_000)
    api_post "/api/v1/riders/#{rider[:id]}/float", { kind: "return", amount_minor: 500_000 }, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/riders/#{rider[:id]}/float", { kind: "return", amount_minor: 20_000 }, headers: headers
    expect(json[:rider][:float_minor]).to eq(150_000)
    expect(cash_balance).to eq(-180_000)
    get "/api/v1/riders/#{rider[:id]}/statement", headers: headers
    expect(json[:rows].map { |r| r[:balance_minor] }).to eq([ 200_000, 170_000, 150_000 ])

    api_post "/api/v1/customers", { name: "Omar", phone: "03009998877", addresses: [ { line1: "Flat 3", area: "Gulberg" } ] }, headers: headers
    cust = json
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust[:id], address_id: cust[:addresses].first[:id], lines: [ { product_id: m[:chai].id, quantity: 2 } ], place: true }, headers: headers
    order = json
    api_post "/api/v1/orders/#{order[:id]}/delivery/assign", { rider_id: rider[:id] }, headers: headers
    api_post "/api/v1/orders/#{order[:id]}/delivery/status", { status: "picked_up" }, headers: headers
    api_post "/api/v1/orders/#{order[:id]}/delivery/status", { status: "delivered", cash_collected_minor: order[:total_minor] }, headers: headers
    expect(response).to have_http_status(:ok)
    get "/api/v1/riders/#{rider[:id]}/settlement_preview", headers: headers
    expect(json[:deliveries_count]).to eq(1)
    expect(json[:cash_collected_minor]).to eq(order[:total_minor])
    expect(json[:expected_minor]).to eq(order[:total_minor] + 150_000)
    api_post "/api/v1/riders/#{rider[:id]}/settle", { handed_in_minor: order[:total_minor] + 150_000 - 1_000, note: "Short by 10" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:settlement][:difference_minor]).to eq(-1_000)
    expect(json[:rider][:float_minor]).to eq(0)
    expect(cash_balance).to eq(-180_000 + order[:total_minor] + 150_000 - 1_000)
    expect(within(biz) { Notification.find_by(kind: "rider_short") }).to be_present
    get "/api/v1/riders/#{rider[:id]}/settlement_preview", headers: headers
    expect(json[:deliveries_count]).to eq(0)
    delete "/api/v1/riders/#{rider[:id]}", headers: headers
    expect(response).to have_http_status(:no_content)
  end
end

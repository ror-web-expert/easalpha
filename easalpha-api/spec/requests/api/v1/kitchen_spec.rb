require "rails_helper"

# The kitchen display after the 6 Nov review: today's orders only (a from= override, pre-orders kept until due), and
# a bump on an order that is already ready is a quiet 200.
RSpec.describe "Kitchen display", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }
  let(:kds) { within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current) } }

  def placed(**extra)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  it "lists today's business day, or from a given day, and keeps a pre-order from an earlier day until it is due" do
    today = today_for(biz)
    old = placed
    within(biz) { Order.find(old[:id]).update_columns(business_day: today - 3) }
    due = placed(scheduled_for: 90.minutes.from_now.iso8601, guest_name: "Office lunch")
    within(biz) { Order.find(due[:id]).update_columns(business_day: today - 2) }
    now = placed
    get "/api/v1/kitchen/orders", headers: device_headers(kds)
    expect(response).to have_http_status(:ok)
    expect(json[:data].map { |o| o[:id] }).to contain_exactly(due[:id], now[:id])
    get "/api/v1/kitchen/orders", params: { from: (today - 3).to_s }, headers: device_headers(kds)
    expect(json[:data].map { |o| o[:id] }).to contain_exactly(old[:id], due[:id], now[:id])
    get "/api/v1/kitchen/orders", params: { from: "yesterday" }, headers: device_headers(kds)
    expect(response).to have_http_status(:bad_request)
  end

  # Final round, contracts#6: an order placed at 01:55 is still cooking at 02:05, when the business day has turned.
  it "keeps an order from the previous business day while it is still in the kitchen, and drops older ones" do
    today = today_for(biz)
    late = placed
    stale = placed
    within(biz) do
      Order.find(late[:id]).update_columns(business_day: today - 1)
      Order.find(stale[:id]).update_columns(business_day: today - 2)
    end
    get "/api/v1/kitchen/orders", headers: device_headers(kds)
    expect(json[:data].map { |o| o[:id] }).to eq([ late[:id] ])
    api_post "/api/v1/kitchen/orders/#{late[:id]}/bump", {}, headers: device_headers(kds)
    api_post "/api/v1/kitchen/orders/#{stale[:id]}/bump", {}, headers: device_headers(kds)
    get "/api/v1/kitchen/ready", headers: device_headers(kds)
    expect(json[:data].map { |o| o[:id] }).to eq([ late[:id] ])
  end

  # Final round, deploy#8 and contracts#7: a queue or token screen in a second window of a till keeps loading with the
  # till's own token while no cashier is signed in there; the kitchen display itself still needs a session.
  it "lets a till or tablet's device token read the queue and ready lists, without customer details, and nothing else" do
    till = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
    tablet = within(biz) { Device.create!(branch: Branch.first, name: "Tab", kind: "tablet", paired_at: Time.current) }
    o = placed(guest_name: "Hina")
    [ till, tablet ].each do |d|
      get "/api/v1/kitchen/queue", headers: device_headers(d)
      expect(response).to have_http_status(:ok), response.body
      expect(json[:preparing].map { |r| r[:id] }).to eq([ o[:id] ])
      expect(json[:preparing].first.keys).to contain_exactly(:id, :serial, :label, :order_type, :guest_name, :status, :placed_at, :ready_at)
      get "/api/v1/kitchen/ready", headers: device_headers(d)
      expect(response).to have_http_status(:ok)
      get "/api/v1/kitchen/orders", headers: device_headers(d)
      expect(json[:error][:code]).to eq("session.required")
      api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(d)
      expect(json[:error][:code]).to eq("session.required")
    end
    rider = within(biz) { Device.create!(branch: Branch.first, name: "Bike", kind: "rider", paired_at: Time.current) }
    get "/api/v1/kitchen/queue", headers: device_headers(rider)
    expect(response).to have_http_status(:unauthorized)
  end

  # QA F12: the queue listed pre-orders due tomorrow and days-old orders as Preparing while the display hid them.
  it "shows on the queue what the kitchen display shows" do
    later = placed(scheduled_for: 1.day.from_now.iso8601, guest_name: "Office lunch")
    old = placed
    within(biz) { Order.find(old[:id]).update_columns(business_day: today_for(biz) - 3) }
    now = placed
    get "/api/v1/kitchen/queue", headers: device_headers(kds)
    expect(json[:preparing].map { |r| r[:id] }).to eq([ now[:id] ])
    expect(json[:preparing].map { |r| r[:id] }).not_to include(later[:id], old[:id])
  end

  it "bumping an order or a line that is already ready changes nothing and answers 200" do
    o = placed
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds)
    expect(json[:status]).to eq("ready")
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("ready")
    api_post "/api/v1/kitchen/items/#{o[:items].first[:id]}/bump", {}, headers: device_headers(kds)
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("ready")
    expect(within(biz) { OrderStatusEvent.where(order_id: o[:id], to_status: "ready").count }).to eq(1)
  end
end

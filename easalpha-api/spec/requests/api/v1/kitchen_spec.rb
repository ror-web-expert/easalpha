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

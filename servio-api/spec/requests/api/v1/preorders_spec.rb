require "rails_helper"

RSpec.describe "Catering pre-orders with advance payment", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  it "takes a scheduled order, keeps it off the kitchen until two hours before, accepts an advance, and alerts when due" do
    when_due = 3.days.from_now.change(hour: 13, min: 0)
    api_post "/api/v1/orders", { order_type: "takeaway", guest_name: "Office lunch", scheduled_for: when_due.iso8601, lines: [ { product_id: m[:burger].id, quantity: 20 } ], place: true }, headers: headers
    expect(response).to have_http_status(:created)
    o = json
    expect(o[:scheduled_for]).to be_present
    expect(o[:status]).to eq("placed")
    get "/api/v1/kitchen/orders", headers: headers
    expect(json[:data].map { |x| x[:id] }).not_to include(o[:id])
    get "/api/v1/orders?preorders=true", headers: headers
    expect(json[:data].map { |x| x[:id] }).to eq([ o[:id] ])
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 300_000 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:order][:payment_status]).to eq("partial")
    expect(json[:order][:paid_minor]).to eq(300_000)
    within(biz) { Order.find(o[:id]).update_columns(scheduled_for: 90.minutes.from_now) }
    get "/api/v1/kitchen/orders", headers: headers
    expect(json[:data].map { |x| x[:id] }).to include(o[:id])
    PreorderDueJob.perform_now
    expect(within(biz) { Notification.find_by(kind: "preorder_due") }).to be_present
    expect(within(biz) { Order.find(o[:id]).preorder_notified_at }).to be_present
    PreorderDueJob.perform_now
    expect(within(biz) { Notification.where(kind: "preorder_due").count }).to eq(1)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] - 300_000 } ] }, headers: headers
    expect(json[:order][:payment_status]).to eq("paid")
  end
end

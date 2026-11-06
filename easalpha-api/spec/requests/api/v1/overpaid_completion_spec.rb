require "rails_helper"

# An order paid above its total (reopened, then a line taken off) is not completed until the excess
# is refunded: complete answers order.overpaid with the amount, the open order takes that refund, then
# completes (review of 6 Nov 2026, R23).
RSpec.describe "Completing an order paid above its total", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def place!(product = m[:burger], customer_id: nil, **extra)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [ { product_id: product.id, quantity: 1 } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  # Burger and chai paid in full, completed, reopened and the chai taken off: Rs 92.80 more was paid than is owed.
  def overpaid!
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:burger].id, quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    burger = json[:items].find { |i| i[:name] == "Zinger Burger" }
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], product_id: m[:burger].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(paid_minor: 61_480, total_minor: 52_200)
    json
  end

  it "refuses to complete it with the amount to refund, takes that refund on the open order, then completes" do
    o = overpaid!
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error]).to include(code: "order.overpaid", details: { refund_minor: 9_280, paid_minor: 61_480, total_minor: 52_200 })
    expect(json[:error][:message]).to include("Rs 92.8")
    api_post "/api/v1/orders/#{o[:id]}/close", {}, headers: headers
    expect(json[:error][:code]).to eq("order.overpaid")

    # Only the excess comes back while the order is open; the rest of the payment stands.
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 9_281, method_code: "cash", reason: "Chai taken off" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("refund.order_open")
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 9_280, method_code: "cash", reason: "Chai taken off" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:order]).to include(status: "served", paid_minor: 52_200, payment_status: "paid")

    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(status: "closed", paid_minor: 52_200, total_minor: 52_200)
  end

  it "keeps a paid order turned into a staff meal open while all of its money goes back, then completes it" do
    o = place!(m[:chai])
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
    api_patch "/api/v1/orders/#{o[:id]}", { is_staff_meal: true, staff_meal_reason: "Kitchen staff" }, headers: headers
    expect(json).to include(total_minor: 0, paid_minor: 9_280)
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(json[:error]).to include(code: "order.overpaid", details: { refund_minor: 9_280, paid_minor: 9_280, total_minor: 0 })
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 9_280, method_code: "cash", reason: "Staff meal" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:order]).to include(status: "served", paid_minor: 0) # not "refunded": the meal was still served
    api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("closed")
  end

  it "is skipped, not failed, by Mark All Completed" do
    o = overpaid!
    # Reopened with nothing changed: open, paid exactly, so Mark All Completed closes it.
    fine = place!(m[:chai])
    api_post "/api/v1/orders/#{fine[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: fine[:total_minor], tendered_minor: fine[:total_minor] } ] }, headers: headers
    api_post "/api/v1/orders/#{fine[:id]}/reopen", {}, headers: headers
    expect(json[:status]).to eq("served")
    api_post "/api/v1/orders/bulk_complete", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(completed: 1, skipped_unpaid: 0, skipped_overpaid: 1)
    within(biz) do
      expect(Order.find(o[:id]).status).to eq("served")
      expect(Order.find(fine[:id]).status).to eq("closed")
    end
  end
end

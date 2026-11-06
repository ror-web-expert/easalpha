require "rails_helper"

# The customer of an order stays once an account (khata) payment was taken on it: the sale sits on
# that customer's account, and a refund would credit whoever the order names (review of 6 Nov 2026, R24).
RSpec.describe "Order customer locked by an account payment", type: :request do
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

  let(:sara) { within(biz) { Customer.create!(name: "Sara", phone: "+923001112233", credit_limit_minor: 10_000_000) } }
  let(:ali) { within(biz) { Customer.create!(name: "Ali", phone: "+923007778888", credit_limit_minor: 10_000_000) } }

  it "stays once khata was taken on the order, online and from the sync queue; cash alone does not lock it" do
    o = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 10_000, tendered_minor: 10_000 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: ali.id }, headers: headers
    expect(response).to have_http_status(:ok), response.body # cash only: the customer may still change
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: sara.id }, headers: headers

    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 10_000 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: ali.id }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("order.customer_locked")
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: nil }, headers: headers
    expect(json[:error][:code]).to eq("order.customer_locked")
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: sara.id, notes: "same customer is fine" }, headers: headers
    expect(response).to have_http_status(:ok), response.body

    device = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T3") }
    cashier = add_member!(biz, "cashier", pin: "1111")
    line = within(biz) { Order.find(o[:id]).items.first }
    api_post "/api/v1/sync/push", { records: [ { type: "order_update", id: o[:id], membership_id: cashier.id, payload: { customer_id: ali.id, lines: [ { id: line.id, product_id: m[:burger].id, quantity: 1 } ], client_seq: 1 } } ] },
             headers: auth_headers(cashier, app: "pos", device: device)
    expect(json[:results].first).to include(status: "rejected", code: "order.customer_locked")
    within(biz) do
      expect(Order.find(o[:id]).customer_id).to eq(sara.id)
      expect(sara.reload.balance_minor).to eq(10_000)
      expect(ali.reload.balance_minor).to eq(0)
    end
  end
end

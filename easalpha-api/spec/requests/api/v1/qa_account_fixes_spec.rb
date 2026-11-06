require "rails_helper"

# Defects the browser QA of 6 Nov 2026 found on customer accounts (students who buy on account and pay any time):
# Receive payment pressed twice, a cashier approved by a manager's PIN, payments dated by a cashier, account sales
# refunded in cash, and order rows without the customer's name.
RSpec.describe "QA: customer accounts", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "TQ9") } }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def customer!(attrs = {})
    api_post "/api/v1/customers", { name: "Ali Raza", phone: "03001234567", member_no: "R-17" }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def account_sale!(customer_id)
    api_post "/api/v1/orders", { order_type: "walk_in", customer_id: customer_id, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  def balance(id) = within(biz) { Customer.find(id).balance_minor }

  it "takes a payment once however often the same press is sent, and refuses that id for another account" do
    c = customer!
    account_sale!(c[:id])
    owed = balance(c[:id])
    pid = SecureRandom.uuid
    api_post "/api/v1/customers/#{c[:id]}/payments", { payment_id: pid, amount_minor: 5_000, method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    first = json[:payment]
    api_post "/api/v1/customers/#{c[:id]}/payments", { payment_id: pid, amount_minor: 5_000, method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:payment][:id]).to eq(first[:id])
    expect(balance(c[:id])).to eq(owed - 5_000)
    other = customer!(name: "Sana", phone: "03007654321", member_no: "R-18")
    api_post "/api/v1/customers/#{other[:id]}/payments", { payment_id: pid, amount_minor: 5_000, method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("payment.foreign_id")
    api_post "/api/v1/customers/#{c[:id]}/payments", { payment_id: "not-a-uuid", amount_minor: 5_000, method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:bad_request)
  end

  it "lets a manager's PIN approve a payment for a till user without khata.collect, and records who approved it" do
    c = customer!
    waiter = add_member!(biz, "waiter", pin: "4321")
    pos = auth_headers(waiter, app: "pos", device: device)
    api_post "/api/v1/customers/#{c[:id]}/payments", { amount_minor: 2_000, method_code: "cash" }, headers: pos
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("approval.required")
    api_post "/api/v1/customers/#{c[:id]}/payments", { amount_minor: 2_000, method_code: "cash", approver_pin: "9999" }, headers: pos
    expect(response).to have_http_status(:created), response.body
    within(biz) do
      log = AuditLog.where(action: "approve", record_id: json[:payment][:id]).sole
      expect(log.after).to include("permission" => "khata.collect", "approved_by" => manager.id, "for" => waiter.id)
    end
  end

  it "dates a payment to another day only for someone who may adjust accounts (the default cashier may not)" do
    c = customer!
    account_sale!(c[:id])
    yesterday = (today_for(biz) - 1).to_s
    cashier = add_member!(biz, "cashier", pin: "1111")
    api_post "/api/v1/customers/#{c[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: yesterday }, headers: auth_headers(cashier, app: "pos", device: device)
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/customers/#{c[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: yesterday }, headers: auth_headers(manager)
    expect(response).to have_http_status(:created), response.body
    expect(json[:payment][:business_day]).to eq(yesterday)
  end

  describe "refund methods" do
    def refund!(order_id, amount, method)
      api_post "/api/v1/orders/#{order_id}/refunds", { amount_minor: amount, method_code: method, reason: "QA" }, headers: headers
    end

    it "refuses to refund an account sale in money, refunds it to the account" do
      c = customer!
      o = account_sale!(c[:id])
      owed = balance(c[:id])
      refund!(o[:id], 1_000, "cash")
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("refund.method")
      refund!(o[:id], 1_000, "khata")
      expect(response).to have_http_status(:created), response.body
      expect(balance(c[:id])).to eq(owed - 1_000)
    end

    it "still refunds a card sale in cash, and a cash sale to the customer's account as store credit" do
      c = customer!
      api_post "/api/v1/orders", { order_type: "walk_in", customer_id: c[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "card", amount_minor: o[:total_minor], reference: "4242" } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      refund!(o[:id], 1_000, "cash")
      expect(response).to have_http_status(:created), response.body
      refund!(o[:id], 1_000, "khata")
      expect(response).to have_http_status(:created), response.body
      expect(balance(c[:id])).to eq(-1_000)
    end
  end

  it "names the customer on order rows, so the till's Orders screen does not show an account sale as Walk-in" do
    c = customer!
    account_sale!(c[:id])
    get "/api/v1/orders", headers: headers
    row = json[:data].find { |o| o[:customer_id] == c[:id] }
    expect(row).to include(customer_name: "Ali Raza", customer_phone: be_present)
  end
end

require "rails_helper"

# Review 3.9 and Appendix A.6 (17 Oct 2026): any cashier could change the service charge at payment. The server now
# asks for prices.override (or a manager PIN that holds it) when an order's service charge moves away from what it had
# or the settings default, and writes every charge and discount change to the audit log with the old and new values.
RSpec.describe "Charge and discount guards", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:ch) { auth_headers(cashier, app: "pos") }

  before { within(biz) { biz.update!(settings: biz.settings.merge("service_charge_percent" => 10)) } }

  def new_order(headers, extra = {})
    api_post "/api/v1/orders", { order_type: "dine_in", lines: [ { product_id: m[:chai].id, quantity: 2 } ] }.merge(extra), headers: headers
    expect(response).to have_http_status(:created)
    json
  end

  def charge_logs(order_id) = within(biz) { AuditLog.where(record_id: order_id, action: "price_change").order(:occurred_at).to_a }

  it "lets a cashier keep the default service charge but asks for a manager PIN to change it" do
    o = new_order(ch)
    expect(o[:service_charge_minor]).to eq(1_600)

    api_patch "/api/v1/orders/#{o[:id]}", { service_charge_percent: 0 }, headers: ch
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("approval.required")

    api_patch "/api/v1/orders/#{o[:id]}", { service_charge_percent: 10 }, headers: ch
    expect(response).to have_http_status(:ok) # the same value is not a change

    manager
    api_patch "/api/v1/orders/#{o[:id]}", { service_charge_percent: 0, approver_pin: "9999" }, headers: ch
    expect(response).to have_http_status(:ok)
    expect(json[:service_charge_minor]).to eq(0)
    log = charge_logs(o[:id]).last
    expect(log.before).to include("service_charge_percent" => "10.0")
    expect(log.after).to include("service_charge_percent" => "0.0", "charge" => true)
    expect(log.user_id).to eq(cashier.user_id)
    expect(log.approved_by_user_id).to eq(manager.user_id)
  end

  it "refuses a cashier's new order that arrives with a lowered service charge, and accepts the default" do
    api_post "/api/v1/orders", { order_type: "dine_in", service_charge_percent: 0, lines: [ { product_id: m[:chai].id } ] }, headers: ch
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/orders", { order_type: "dine_in", service_charge_percent: 10, lines: [ { product_id: m[:chai].id } ] }, headers: ch
    expect(response).to have_http_status(:created)
  end

  it "lets a manager change it and logs the old and new value" do
    o = new_order(auth_headers(manager, app: "pos"))
    api_patch "/api/v1/orders/#{o[:id]}", { service_charge_fixed_minor: 5_000, service_charge_percent: 0 }, headers: auth_headers(manager, app: "pos")
    expect(response).to have_http_status(:ok)
    expect(json[:service_charge_minor]).to eq(5_000)
    log = charge_logs(o[:id]).last
    expect(log.after).to include("service_charge_fixed_minor" => 5_000)
    expect(log.approved_by_user_id).to be_nil
  end

  it "logs a delivery charge change without blocking it (the till sets it from a zone quote)" do
    api_post "/api/v1/orders", { order_type: "delivery", lines: [ { product_id: m[:chai].id } ] }, headers: ch
    o = json
    api_patch "/api/v1/orders/#{o[:id]}", { delivery_charge_minor: 15_000 }, headers: ch
    expect(response).to have_http_status(:ok)
    expect(json[:delivery_charge_minor]).to eq(15_000)
    expect(charge_logs(o[:id]).last.after).to include("delivery_charge_minor" => 15_000)
  end

  it "logs a discount with the order's discount and total before and after, and its removal" do
    o = new_order(auth_headers(manager, app: "pos"))
    api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 10, reason: "Regular" }, headers: auth_headers(manager, app: "pos")
    expect(response).to have_http_status(:ok)
    discount_id = json[:discounts].first[:id]
    log = within(biz) { AuditLog.where(record_id: o[:id], action: "discount").order(:occurred_at).last }
    expect(log.before).to include("discount_minor" => 0, "total_minor" => o[:total_minor])
    expect(log.after["discount_minor"]).to be > 0

    delete "/api/v1/orders/#{o[:id]}/discounts/#{discount_id}", headers: auth_headers(manager, app: "pos")
    expect(response).to have_http_status(:ok)
    removed = within(biz) { AuditLog.where(record_id: o[:id], action: "discount").order(:occurred_at).last }
    expect(removed.after).to include("removed" => true, "discount_minor" => 0)
    expect(removed.before["amount_minor"]).to be > 0
  end
end

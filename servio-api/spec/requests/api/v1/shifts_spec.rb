require "rails_helper"

RSpec.describe "Shifts, cash drawer and day close", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }

  def sell_cash(as:, amount: 9_280, tendered: nil, lines: [{ product_id: m[:chai].id }])
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }, headers: as
    oid = json[:id]
    api_post "/api/v1/orders/#{oid}/payments", { payments: [{ method_code: "cash", amount_minor: amount, tendered_minor: tendered || amount }] }, headers: as
    expect(response).to have_http_status(:created)
    oid
  end

  it "opens a shift with opening cash, creates a drawer account, attaches sales, and closes blind with over or short" do
    api_post "/api/v1/shifts", { opening_cash_minor: 500_000 }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    shift = json
    expect(shift[:status]).to eq("open")
    expect(shift[:expected_cash_minor]).to be_nil   # cashier never sees the expected figure
    expect(shift[:drawer_account_id]).to be_present
    api_post "/api/v1/shifts", { opening_cash_minor: 1 }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("shift.already_open")

    sell_cash(as: auth_headers(cashier), tendered: 10_000)                      # +9,280, change 720 handed back
    api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "cash_out", amount_minor: 2_000, reason: "Milk from the shop" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:movement][:amount_minor]).to eq(-2_000)
    api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "cash_in", amount_minor: 1_000, reason: "" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:bad_request)

    get "/api/v1/shifts/#{shift[:id]}", headers: headers
    expect(json[:expected_cash_minor]).to eq(500_000 + 9_280 - 2_000)
    get "/api/v1/shifts/#{shift[:id]}/z_report", headers: auth_headers(cashier)
    expect(json[:by_payment_method][:cash]).to eq(9_280)
    expect(json[:cash][:cash_out_minor]).to eq(2_000)

    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 507_000, count_detail: { "5000" => 101, "500" => 4 } }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("closed")
    expect(json[:expected_cash_minor]).to eq(507_280)
    expect(json[:over_short_minor]).to eq(-280)
    within(biz) do
      s = Shift.find(shift[:id])
      expect(s.z_report["sales"]["net_minor"]).to eq(9_280)
      expect(PaymentAccount.find(s.drawer_account_id).current_balance_minor).to eq(500_000 + 9_280 - 2_000)
      expect(Order.last.shift_id).to eq(s.id)
    end
    api_post "/api/v1/shifts/#{shift[:id]}/approve", {}, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/shifts/#{shift[:id]}/approve", {}, headers: headers
    expect(json[:approved_by_membership_id]).to eq(owner.id)
    api_post "/api/v1/shifts/#{shift[:id]}/settle", {}, headers: headers
    expect(json[:settlement_status]).to eq("settled")
    within(biz) do
      expect(PaymentAccount.find(shift[:drawer_account_id]).current_balance_minor).to eq(0)
      expect(PaymentAccount.find_by!(name: "Cash").current_balance_minor).to eq(500_000 + 9_280 - 2_000)
    end
  end

  it "refuses to close with open orders unless forced by a manager, and alerts the owner when short" do
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: auth_headers(cashier)
    shift = json
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id }], place: true }, headers: auth_headers(cashier)
    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 0 }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("shift.open_orders")
    within(biz) { biz.update!(settings: { "cash_short_alert_minor" => 100 }) }
    sell_cash(as: auth_headers(cashier), amount: 9_280)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id }], place: true }, headers: auth_headers(cashier)
    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 0, force: true }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("force_closed")
    expect(json[:over_short_minor]).to eq(-9_280)
    within(biz) { expect(Notification.where(kind: "cash_short").count).to eq(1) }
  end

  it "manager cash out needs a PIN for a cashier beyond cash in, and drops are recorded" do
    api_post "/api/v1/shifts", { opening_cash_minor: 100_000 }, headers: auth_headers(cashier)
    shift = json
    manager
    api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "drop", amount_minor: 50_000, reason: "Safe drop", approver_pin: "9999" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:movement][:approved_by_membership_id]).to eq(manager.id)
    expect(json[:shift][:movements].size).to eq(1)
    mid = SecureRandom.uuid
    2.times { api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "cash_in", amount_minor: 1_000, reason: "Float", movement_id: mid }, headers: auth_headers(cashier) }
    within(biz) { expect(CashMovement.where(shift_id: shift[:id]).count).to eq(2) }
  end

  it "closes the day only when every shift is closed and no order is open, locks it, and refuses new orders until reopened" do
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: auth_headers(cashier)
    shift = json
    sell_cash(as: auth_headers(cashier))
    get "/api/v1/day_close", headers: headers
    expect(json[:ready]).to be false
    expect(json[:shifts][:open]).to eq(1)
    day = json[:business_day]
    api_post "/api/v1/day_close/lock", { business_day: day }, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 9_280 }, headers: auth_headers(cashier)
    api_post "/api/v1/day_close/lock", { business_day: day }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:locked]).to be true
    expect(json[:summary][:net_sales_minor]).to eq(9_280)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id }] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("day.locked")
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/day_close/reopen", { business_day: day, reason: "" }, headers: headers
    expect(response).to have_http_status(:bad_request)
    api_post "/api/v1/day_close/reopen", { business_day: day, reason: "Forgot an order" }, headers: headers
    expect(json[:locked]).to be false
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id }] }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/audit_logs?table_name=day_closes", headers: headers
    # The two rows the controller writes plus the create the Audited concern writes for the day_closes record.
    expect(json[:data].size).to eq(3)
    expect(json[:data].map { |a| a[:action] }).to include("create")
  end

  it "a cashier sees only their own shifts and other businesses see nothing" do
    api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: auth_headers(cashier)
    sid = json[:id]
    other_cashier = add_member!(biz, "cashier", pin: "2222")
    get "/api/v1/shifts", headers: auth_headers(other_cashier)
    expect(json[:data]).to be_empty
    get "/api/v1/shifts/current", headers: auth_headers(other_cashier)
    expect(json[:shift]).to be_nil
    get "/api/v1/shifts", headers: headers
    expect(json[:data].size).to eq(1)
    other = signup_business(name: "Other")
    get "/api/v1/shifts/#{sid}", headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
  end
end

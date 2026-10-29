require "rails_helper"

# Canteen (factory mess), 29 Oct 2026: a worker scans a finger at the kiosk, takes one dish from the published plan for
# the current session, gets a token and is refused a second helping; the meal sits on the worker's account and comes
# off the payroll run.
RSpec.describe "Canteen", type: :request do
  let!(:owner) { signup_business(name: "Steel Works Mess") }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:kiosk) { within(biz) { Device.create!(branch: Branch.first, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1") } }
  let(:worker) { within(biz) { Employee.create!(name: "Akbar Ali", phone: "+923001112233", cnic: "35202-1234567-1", base_salary_minor: 3_000_000, pay_frequency: "monthly", fingerprint_id: "FP-001", fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current) } }
  let(:lunch) { within(biz) { MealSession.create!(branch: Branch.first, name: "Lunch", starts_at: "00:00", ends_at: "23:59") } }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  def publish_lunch!(items: [ { product_id: m[:burger].id, planned_qty: 100, worker_price_minor: 20_000 }, { product_id: m[:chai].id } ])
    api_post "/api/v1/canteen/plans", { meal_session_id: lunch.id, plan_date: today_for(biz).to_s, items: items, publish: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    json
  end

  it "switching the canteen on brings customer accounts with it and the module shows in the sidebar list" do
    get "/api/v1/me", headers: headers
    expect(json[:modules]).to include(canteen: true, customer_accounts: true)
  end

  it "serves one dish per worker per session: fingerprint, token, account, then 'already taken'" do
    plan = publish_lunch!
    burger_item = plan[:items].find { |i| i[:product_id] == m[:burger].id }
    expect(plan[:status]).to eq("published")

    get "/api/v1/canteen/today", headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json[:session][:name]).to eq("Lunch")
    expect(json[:plans].first[:items].map { |i| i[:name] }).to contain_exactly("Zinger Burger", "Chai")

    worker
    api_post "/api/v1/canteen/claims", { id: SecureRandom.uuid, fingerprint_id: "FP-001", meal_plan_item_id: burger_item[:id], token_label: "Q1-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body
    claim = json
    expect(claim).to include(employee_name: "Akbar Ali", dish: "Zinger Burger", token_label: "Q1-001", token_no: 1, status: "claimed", source: "fingerprint")
    # Rs 450 + 16% tax = Rs 522 full price; the worker pays Rs 200, the company the rest
    expect(claim[:worker_price_minor]).to eq(20_000)
    expect(claim[:company_share_minor]).to eq(52_200 - 20_000)
    within(biz) do
      e = Employee.find(worker.id)
      expect(e.customer_id).to be_present
      expect(Customer.find(e.customer_id).balance_minor).to eq(20_000)
      o = Order.find(claim[:order_id])
      expect(o).to have_attributes(source: "kiosk", payment_status: "paid", customer_id: e.customer_id)
      expect(o.payments.map(&:method_code)).to contain_exactly("khata", "canteen_subsidy")
      expect(PaymentMethod.find_by(code: "canteen_subsidy").internal).to be true
      expect(KitchenTicket.where(order_id: o.id)).to be_empty
    end

    # the same worker again in the same session
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: burger_item[:id], token_label: "Q1-002" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("canteen.already_taken")
    expect(json[:error][:message]).to include("Akbar Ali", "Q1-001")
    expect(json[:error][:details][:claim][:token_label]).to eq("Q1-001")
    # the same claim id arriving twice (a retry) is the same claim, not a second helping
    api_post "/api/v1/canteen/claims", { id: claim[:id], fingerprint_id: "FP-001", meal_plan_item_id: burger_item[:id], token_label: "Q1-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created)
    expect(json[:id]).to eq(claim[:id])

    # the counter serves it: the order completes
    api_post "/api/v1/canteen/claims/#{claim[:id]}/serve", {}, headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("served")
    expect(within(biz) { Order.find(claim[:order_id]).status }).to eq("closed")

    get "/api/v1/canteen/claims", headers: device_headers(kiosk)
    expect(json[:data].size).to eq(1)
    get "/api/v1/canteen/today", headers: device_headers(kiosk)
    expect(json[:counts]).to include(claimed: 1, served: 1)
    expect(json[:plans].first[:items].find { |i| i[:product_id] == m[:burger].id }[:claims_count]).to eq(1)
  end

  it "refuses an unknown finger, an unpublished day and a sold-out dish; manual lookup finds the worker by phone" do
    worker
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-999" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:not_found)
    expect(json[:error][:code]).to eq("canteen.unknown_worker")

    lunch
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(json[:error][:code]).to eq("canteen.no_plan")

    plan = publish_lunch!(items: [ { product_id: m[:chai].id, planned_qty: 1 } ])
    get "/api/v1/canteen/workers", params: { q: "0300 111 2233" }, headers: device_headers(kiosk)
    expect(json[:data].first[:name]).to eq("Akbar Ali")
    api_post "/api/v1/canteen/claims", { employee_id: worker.id, source: "manual" }, headers: device_headers(kiosk) # one dish: chosen for them
    expect(response).to have_http_status(:created), response.body
    expect(json[:source]).to eq("manual")
    other = within(biz) { Employee.create!(name: "Bilal", base_salary_minor: 1, pay_frequency: "monthly") }
    api_post "/api/v1/canteen/claims", { employee_id: other.id, meal_plan_item_id: plan[:items].first[:id] }, headers: device_headers(kiosk)
    expect(json[:error][:code]).to eq("canteen.sold_out")
  end

  it "cancels a meal with a reason: the account is refunded and the dish count goes back" do
    plan = publish_lunch!
    worker
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id] }, headers: device_headers(kiosk)
    id = json[:id]
    api_post "/api/v1/canteen/claims/#{id}/cancel", { reason: "wrong finger" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:unauthorized) # the kiosk cannot cancel; a manager can
    api_post "/api/v1/canteen/claims/#{id}/cancel", { reason: "wrong finger" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("cancelled")
    within(biz) do
      expect(Customer.find(Employee.find(worker.id).customer_id).balance_minor).to eq(0)
      expect(Order.find(MealClaim.find(id).order_id).status).to eq("refunded")
      expect(MealPlanItem.find(plan[:items].first[:id]).claims_count).to eq(0)
    end
    # and the worker may take a meal again in that session
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id] }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created)
  end

  it "takes claims from an offline kiosk through the sync push, once each, and refuses the second helping there too" do
    plan = publish_lunch!
    worker
    id = SecureRandom.uuid
    rec = { type: "meal_claim", id: id, payload: { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id], meal_session_id: lunch.id, token_label: "Q1-007", client_created_at: 5.minutes.ago.iso8601, source: "fingerprint" } }
    api_post "/api/v1/sync/push", { records: [ rec, rec.merge(id: SecureRandom.uuid, payload: rec[:payload].merge(token_label: "Q1-008")) ] }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:results].map { |r| r[:status] }).to eq(%w[accepted rejected])
    expect(json[:results].last[:code]).to eq("canteen.already_taken")
    api_post "/api/v1/sync/push", { records: [ rec ] }, headers: device_headers(kiosk)
    expect(json[:results].first[:status]).to eq("duplicate")
    get "/api/v1/canteen/sync", headers: device_headers(kiosk)
    expect(json[:claims].map { |c| c[:token_label] }).to eq([ "Q1-007" ])
    expect(json[:workers].first).to include(name: "Akbar Ali", fingerprint_id: "FP-001")
    get "/api/v1/sync/changes", headers: device_headers(kiosk)
    expect(json[:canteen][:claims].map { |c| c[:token_label] }).to eq([ "Q1-007" ])
    expect(json[:canteen][:workers].first).to include(name: "Akbar Ali", fingerprint_id: "FP-001")
    expect(json[:canteen][:plans].first[:items].size).to eq(2)
  end

  it "reports meals by day, session and dish, per worker, as CSV too, and takes the month off the payroll run" do
    plan = publish_lunch!
    worker
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id] }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created)
    day = today_for(biz).to_s
    get "/api/v1/canteen/reports/summary", params: { from: day, to: day, group_by: "dish" }, headers: headers
    expect(json[:rows].first).to include(key: "Zinger Burger", meals: 1, planned: 100, worker_minor: 20_000, company_minor: 32_200)
    get "/api/v1/canteen/reports/summary", params: { from: day, to: day, group_by: "session" }, headers: headers
    expect(json[:rows].first[:key]).to eq("Lunch")
    get "/api/v1/canteen/reports/workers", params: { from: day, to: day }, headers: headers
    expect(json[:rows].first).to include(name: "Akbar Ali", meals: 1, worker_minor: 20_000)
    get "/api/v1/canteen/reports/workers", params: { from: day, to: day, csv: 1 }, headers: headers
    expect(response.content_type).to include("text/csv")
    expect(response.body).to include("Akbar Ali", "200.0")
    get "/api/v1/canteen/workers/#{worker.id}", params: { from: day, to: day }, headers: headers
    expect(json[:claims].size).to eq(1)

    api_patch "/api/v1/settings", { values: { "modules.payroll" => true } }, headers: headers
    api_post "/api/v1/payroll/runs", { month: Date.parse(day).strftime("%Y-%m") }, headers: headers
    expect(response).to have_http_status(:created), response.body
    run_id = json[:id]
    slip = json[:payslips].find { |p| p[:employee_id] == worker.id }
    expect(slip[:deductions_minor]).to eq(20_000)
    expect(slip[:detail][:components].map { |c| c[:name] }).to include("Canteen meals (1)")
    api_post "/api/v1/payroll/runs/#{run_id}/pay", { method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    within(biz) do
      expect(Customer.find(Employee.find(worker.id).customer_id).balance_minor).to eq(0)
      expect(CustomerPayment.where(customer_id: Employee.find(worker.id).customer_id).sum(:amount_minor)).to eq(20_000)
    end
  end

  it "keeps the kiosk's endpoints away from kitchen screens and plans away from staff without canteen.manage" do
    kds = within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current, code: "K1") }
    get "/api/v1/canteen/today", headers: device_headers(kds)
    expect(response).to have_http_status(:unauthorized)
    cashier = add_member!(biz, "cashier")
    api_post "/api/v1/canteen/plans", { meal_session_id: lunch.id, plan_date: today_for(biz).to_s, items: [] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    api_patch "/api/v1/settings", { values: { "modules.canteen" => false } }, headers: headers
    get "/api/v1/canteen/today", headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("module.disabled")
  end
end

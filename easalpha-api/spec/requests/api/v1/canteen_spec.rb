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
  # Open the whole business day: it opens at the day end (02:01), so a meal at any hour is on today_for(biz). (A window
  # opening at midnight opens in the previous business day, and its meals are that day's.)
  let(:lunch) { within(biz) { MealSession.create!(branch: Branch.first, name: "Lunch", starts_at: "02:01", ends_at: "02:00") } }

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
    expect(json[:workers].first).to include(name: "Akbar Ali", fingerprint_hash: CanteenSerializers.fingerprint_hash("FP-001", biz.id))
    get "/api/v1/sync/changes", headers: device_headers(kiosk)
    expect(json[:canteen][:claims].map { |c| c[:token_label] }).to eq([ "Q1-007" ])
    expect(json[:canteen][:workers].first).to include(name: "Akbar Ali", fingerprint_hash: CanteenSerializers.fingerprint_hash("FP-001", biz.id))
    expect(json[:canteen][:plans].first[:items].size).to eq(2)
  end

  # contracts#0, deploy-upgrade#0: a kiosk offline through the end of Lunch pushed its queue at 15:40 and every meal
  # came back canteen.session_closed: no order, nothing on the worker's account, nothing for payroll.
  it "records through the sync push a lunch a kiosk served offline, after the session closed" do
    tz = ActiveSupport::TimeZone[branch.time_zone]
    real_lunch = within(biz) { MealSession.create!(branch: branch, name: "Lunch 12-15", starts_at: "12:00", ends_at: "15:00") }
    item = travel_to(tz.parse("2026-11-06 11:00")) do
      within(biz) { Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: real_lunch, date: Date.new(2026, 11, 6), items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ])).items.first }
    end
    worker
    rec = { type: "meal_claim", id: SecureRandom.uuid, payload: { fingerprint_id: "FP-001", meal_plan_item_id: item.id, meal_session_id: real_lunch.id, token_label: "Q1-012", source: "fingerprint",
                                                                  client_created_at: tz.parse("2026-11-06 12:31").iso8601 } }
    travel_to tz.parse("2026-11-06 15:40") do
      api_post "/api/v1/sync/push", { records: [ rec ] }, headers: device_headers(kiosk)
      expect(response).to have_http_status(:ok), response.body
      expect(json[:results].first).to include(status: "accepted")
    end
    within(biz) do
      c = MealClaim.find(rec[:id])
      expect(c).to have_attributes(plan_date: Date.new(2026, 11, 6), token_label: "Q1-012", worker_price_minor: 20_000, scanned_at: tz.parse("2026-11-06 12:31"))
      expect(Customer.find(Employee.find(worker.id).customer_id).balance_minor).to eq(20_000)
      expect(SyncRejection.where(record_id: rec[:id])).to be_empty
    end
  end

  # F6: between the business-day end (02:01) and the next plan the kiosk said the Night menu was not published, and the
  # counter lost the tokens issued before 02:01 because it listed the new day's claims only.
  it "keeps a night session's plan on the kiosk and its tokens on the counter past the business-day end" do
    tz = ActiveSupport::TimeZone[branch.time_zone]
    night = within(biz) { MealSession.create!(branch: branch, name: "Night", starts_at: "23:00", ends_at: "06:00") }
    monday = Date.new(2026, 11, 9)
    item = within(biz) { Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: night, date: monday, items: [ { product_id: m[:chai].id } ])).items.first }
    worker
    travel_to(tz.parse("2026-11-09 23:40")) { api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: item.id, token_label: "Q1-001" }, headers: device_headers(kiosk) }
    expect(response).to have_http_status(:created), response.body
    travel_to tz.parse("2026-11-10 03:00") do
      get "/api/v1/canteen/today", headers: device_headers(kiosk)
      expect(json).to include(date: monday.to_s, business_day: (monday + 1).to_s)
      expect(json[:session][:name]).to eq("Night")
      expect(json[:branch]).to include(time_zone: branch.time_zone, day_end: "02:01")
      expect(json[:plans].map { |p| [ p[:session][:name], p[:plan_date], p[:status] ] }).to eq([ [ "Night", monday.to_s, "published" ] ])
      expect(json[:counts][:claimed]).to eq(1)
      get "/api/v1/canteen/claims", params: { status: "claimed" }, headers: device_headers(kiosk)
      expect(json[:data].map { |c| c[:token_label] }).to eq([ "Q1-001" ])
      expect(json[:dates]).to include(monday.to_s, (monday + 1).to_s)
      get "/api/v1/canteen/sync", headers: device_headers(kiosk)
      expect(json).to include(date: monday.to_s, time_zone: branch.time_zone, day_end: "02:01")
      expect(json[:claims].map { |c| c[:token_label] }).to eq([ "Q1-001" ])
      expect(json[:plans].map { |p| p[:plan_date] }).to include(monday.to_s)
    end
    travel_to tz.parse("2026-11-10 06:20") do # the night is over, grace included: the counter moves on to Tuesday
      get "/api/v1/canteen/claims", params: { status: "claimed" }, headers: device_headers(kiosk)
      expect(json[:data]).to eq([])
    end
  end

  # F13: the kiosk showed the menu price before tax (Rs 80 for Chai) and the claim charged Rs 92.80.
  it "gives every dish the price a kiosk order charges and what the worker pays" do
    plan = publish_lunch!
    get "/api/v1/canteen/today", headers: device_headers(kiosk)
    items = json[:plans].first[:items].index_by { |i| i[:name] }
    expect(items["Chai"]).to include(price_minor: 8_000, full_price_minor: 9_280, worker_pays_minor: 9_280, worker_price_minor: nil)
    expect(items["Zinger Burger"]).to include(price_minor: 45_000, full_price_minor: 52_200, worker_pays_minor: 20_000)
    worker
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].find { |i| i[:name] == "Chai" }[:id] }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body
    expect(json[:worker_price_minor]).to eq(items["Chai"][:worker_pays_minor])
  end

  # R19: a meal the kiosk took offline and the server refused at replay reached nobody: the kiosk kept counting it as
  # waiting to send and no screen listed it. The admin Today page lists it, with who, what and why, until resolved.
  it "lists the meals refused at sync on the admin Today page until a canteen manager resolves them" do
    plan = publish_lunch!
    worker
    rec = { type: "meal_claim", id: SecureRandom.uuid, payload: { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id], meal_session_id: lunch.id, token_label: "Q1-007", client_created_at: 5.minutes.ago.iso8601, source: "fingerprint" } }
    second = rec.merge(id: SecureRandom.uuid, payload: rec[:payload].merge(token_label: "Q1-008", client_created_at: 2.minutes.ago.iso8601))
    api_post "/api/v1/sync/push", { records: [ rec, second ] }, headers: device_headers(kiosk)
    expect(json[:results].map { |r| r[:status] }).to eq(%w[accepted rejected])

    get "/api/v1/canteen/today", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:counts][:refused]).to eq(1)
    expect(json[:refused].size).to eq(1)
    row = json[:refused].first
    expect(row).to include(record_id: second[:id], token_label: "Q1-008", employee_id: worker.id, employee_name: "Akbar Ali", fingerprint_id: "FP-001", dish: "Zinger Burger", session: "Lunch",
                           device: "Q1", code: "canteen.already_taken", taken_at: Time.iso8601(second[:payload][:client_created_at]).utc.iso8601(3))
    expect(row[:message]).to start_with("Akbar Ali already took Zinger Burger")
    expect(row.keys).not_to include(:payload)
    get "/api/v1/canteen/today", headers: device_headers(kiosk) # the kiosk has its own list, from the sync results
    expect(json).not_to have_key(:refused)

    cashier = add_member!(biz, "cashier")
    api_post "/api/v1/canteen/refused/#{row[:id]}/resolve", { resolution: "fixed" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/canteen/refused/#{row[:id]}/resolve", { resolution: "fixed" }, headers: headers
    expect(response).to have_http_status(:no_content)
    within(biz) { expect(SyncRejection.find(row[:id])).to have_attributes(resolution: "fixed", resolved_by_membership_id: owner.id) }
    get "/api/v1/canteen/today", headers: headers
    expect(json[:counts][:refused]).to eq(0)
    expect(json[:refused]).to eq([])
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

  # Roles test, 6 Nov 2026: with no from/to both reports answered 500, because the default month called this
  # controller's own Today action instead of the business day.
  it "reports the month so far when no period is given" do
    plan = publish_lunch!
    worker
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001", meal_plan_item_id: plan[:items].first[:id] }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body
    day = today_for(biz)
    get "/api/v1/canteen/reports/summary", params: { group_by: "day" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(from: day.beginning_of_month.to_s, to: day.to_s)
    expect(json[:totals][:meals]).to eq(1)
    get "/api/v1/canteen/reports/workers", headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:rows].first).to include(name: "Akbar Ali", meals: 1)
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

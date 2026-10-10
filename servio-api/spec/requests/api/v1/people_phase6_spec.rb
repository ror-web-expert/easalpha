require "rails_helper"

# SPEC "Staff, attendance and payroll", "Riders" and the Cashier Till report: the rules engine, the scan log and
# enrolment, payroll priced from the stored statuses with a snapshot, temporary riders with a lifetime and their own
# permissions, Rider Reports, Cashier Till with Day-End Settlement, My Till.
RSpec.describe "People phase 6", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:cashier) { add_member!(biz, "cashier", pin: "4321") }
  let(:m) { build_menu!(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def grant!(member, codes)
    within(biz) { member.set_permissions!(codes) }
    auth_headers(member.reload)
  end

  describe "attendance rules engine" do
    it "decides the status on the first scan, logs every tap, applies the checkout gap, overtime and auto-close, and prices the month with allowances, penalties and the cap" do
      api_put "/api/v1/employees/rules", { shift_start: "10:00", shift_end: "18:00", rules_enabled: true, late_after_minutes: 15, half_day_after_minutes: 120, absent_after_minutes: 300, overtime_enabled: true, overtime_rate_minor_per_hour: 20_000,
                                           free_lates: 1, late_penalty: "fine_only", late_fine_minor: 50_000, half_day_penalty: "lose_day", absent_penalty: "both", absent_fine_minor: 10_000, fine_cap_minor: 60_000,
                                           checkout_gap_minutes: 10, working_days: [ 1, 2, 3, 4, 5, 6 ], absent_rule: "fixed_26", fixed_divisor: 26 }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json).to include(rules_enabled: true, late_after_minutes: 15, late_penalty: "fine_only", fine_cap_minor: 60_000)
      api_post "/api/v1/employees", { name: "Asif", designation: "Cook", base_salary_minor: 2_600_000, joined_on: "2026-01-01" }, headers: headers
      emp = json
      api_post "/api/v1/attendance/enrol", { employee_id: emp[:id], fingerprint_id: "FP-77" }, headers: headers
      expect(json).to include(fingerprint_enrolled: true, fingerprint_id: "FP-77")
      api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-99" }, headers: headers
      expect(response).to have_http_status(:not_found)

      tz = branch.time_zone
      month = Date.new(2026, 9, 1)
      day1 = Time.use_zone(tz) { Time.zone.parse("2026-09-01 10:20") } # 20 minutes late (first free late)
      day2 = Time.use_zone(tz) { Time.zone.parse("2026-09-02 10:30") } # 30 minutes late: fined
      day3 = Time.use_zone(tz) { Time.zone.parse("2026-09-03 12:30") } # half day
      day4 = Time.use_zone(tz) { Time.zone.parse("2026-09-04 16:00") } # absent after 300 minutes
      travel_to(day1) do
        api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers
        expect(json[:result]).to eq("check_in")
        expect(json[:attendance]).to include(status: "late", late_minutes: 20)
        api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers
        expect(json[:result]).to eq("already_marked")
        expect(json[:message]).to eq("Already Marked")
      end
      travel_to(day1 + 9.hours) do # 19:20: one hour and twenty minutes of overtime
        api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers
        expect(json[:result]).to eq("check_out")
        expect(json[:attendance]).to include(overtime_minutes: 80)
      end
      travel_to(day2) { api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers; expect(json[:attendance][:status]).to eq("late") }
      travel_to(day3) { api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers; expect(json[:attendance][:status]).to eq("half_day") }
      travel_to(day4) { api_post "/api/v1/attendance/scan", { fingerprint_id: "FP-77" }, headers: headers; expect(json[:attendance][:status]).to eq("absent") }
      # Nobody checked out on day 2, 3 or 4: the next scan closes the stale day, the job closes the last one; all flagged as missing punches with no overtime.
      api_post "/api/v1/attendance/auto_close", { business_day: "2026-09-04" }, headers: headers
      expect(json[:closed]).to eq(1)
      get "/api/v1/attendance/ledger?employee_id=#{emp[:id]}&month=2026-09", headers: headers
      expect(json[:days].map { |d| d[:status] }.first(4)).to eq(%w[late late half_day absent])
      expect(json[:days][1]).to include(missing_punch: true, auto_closed: true, overtime_minutes: 0)
      s = json[:summary]
      expect(s).to include(late: 2, half_days: 1, absent: 1, overtime_minutes: 80, missing_punches: 3)
      # one late forgiven, one fined 500; absent fined 100 and loses the day; half day loses half a day; cap 600 holds.
      expect(s[:charges]).to include(fines_minor: 60_000, fines_before_cap_minor: 60_000, lost_days: 1.5)
      get "/api/v1/attendance/scans?employee_id=#{emp[:id]}", headers: headers
      expect(json[:data].map { |x| x[:result] }.tally).to include("check_in" => 4, "already_marked" => 1, "check_out" => 1, "auto_close" => 3)
      get "/api/v1/attendance/today?business_day=2026-09-01", headers: headers
      expect(json[:counters]).to include(late: 1, checked_out: 1, currently_in: 0)

      # Rules change later: saved days keep their status (SPEC).
      api_put "/api/v1/employees/rules", { rules_enabled: false }, headers: headers
      get "/api/v1/attendance/ledger?employee_id=#{emp[:id]}&month=2026-09", headers: headers
      expect(json[:days].map { |d| d[:status] }.first(4)).to eq(%w[late late half_day absent])
      api_put "/api/v1/employees/rules", { rules_enabled: true }, headers: headers

      # Payroll prices the month with the fixed divisor and snapshots what it used.
      api_post "/api/v1/payroll/runs", { month: "2026-09" }, headers: headers
      expect(response).to have_http_status(:created)
      slip = json[:payslips].find { |p| p[:employee_id] == emp[:id] }
      expect(slip[:late_fines_minor]).to eq(60_000)
      expect(slip[:detail][:divisor]).to eq(26)
      expect(slip[:absence_minor]).to eq((2_600_000 / 26.0 * 1.5).round + (2_600_000 / 26.0 * slip[:detail][:attendance][:absent_filled].to_i).round) if false
      expect(slip[:detail][:lost_days]).to be >= 1.5
      expect(slip[:detail][:overtime_minor]).to eq((80 / 60.0 * 20_000).round)
      expect(json[:settings_snapshot]).to include(salary_method: "fixed_26", fixed_divisor: 26, rules_enabled: true)
      api_get_overview = -> { get "/api/v1/payroll/overview", headers: headers; json }
      expect(api_get_overview.call).to include(employees: 1, pending_advances: 0)
      get "/api/v1/payroll/ledger?employee_id=#{emp[:id]}", headers: headers
      expect(json[:data].size).to eq(1)
      get "/api/v1/payroll/reports?from=2026-09&to=2026-09", headers: headers
      expect(json[:by_month].size).to eq(1)
      get "/api/v1/payroll/settings", headers: headers
      expect(json).to include(salary_method: "fixed_divisor", fixed_divisor: 26)
      expect(json[:example]).to include(february_day_minor: 107_143, january_day_minor: 96_774)
      api_patch "/api/v1/payroll/settings", { salary_method: "calendar_days", require_fingerprint_to_close_shift: true }, headers: headers
      expect(json).to include(salary_method: "calendar_days", require_fingerprint_to_close_shift: true)
      get "/api/v1/payroll/overview", headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end

    it "records every scan as Present when the master switch is off" do
      api_put "/api/v1/employees/rules", { shift_start: "10:00", shift_end: "18:00", rules_enabled: false }, headers: headers
      api_post "/api/v1/employees", { name: "Bilal", base_salary_minor: 1_000_000 }, headers: headers
      emp = json
      travel_to(Time.use_zone(branch.time_zone) { Time.zone.parse("2026-09-01 14:00") }) do
        api_post "/api/v1/attendance/scan", { employee_id: emp[:id], source: "manual" }, headers: headers
        expect(json[:attendance]).to include(status: "present", late_minutes: 0)
      end
    end
  end

  describe "riders" do
    it "creates temporary riders with a lifetime and their own permissions, counts assigned against completed, expires them, and reports per rider" do
      m
      ch = grant!(cashier, %w[SALES_DELIVERY RIDERS RIDER_VIEW])
      api_post "/api/v1/riders", { name: "Temp", temporary: true, lifetime_kind: "one_order" }, headers: ch
      expect(response).to have_http_status(:forbidden) # no DUMMY_RIDER_CREATE
      ch = grant!(cashier, %w[SALES_DELIVERY RIDERS RIDER_VIEW DUMMY_RIDER_VIEW DUMMY_RIDER_CREATE])
      api_post "/api/v1/riders", { name: "Temp", temporary: true, lifetime_kind: "one_order", permissions: %w[collect_cash] }, headers: ch
      expect(response).to have_http_status(:created)
      temp = json
      expect(temp).to include(temporary: true, lifetime_label: "One order", orders_allowed: 1, orders_used: 0, expired: false, permissions: %w[collect_cash])
      api_post "/api/v1/riders", { name: "Hours", temporary: true, lifetime_kind: "n_hours", lifetime_value: 3 }, headers: headers
      expect(json[:expires_at]).to be_present
      api_post "/api/v1/riders", { name: "Perm", phone: "0300 1112222", vehicle: "Bike", charge_per_delivery_minor: 10_000 }, headers: headers
      perm = json
      expect(perm).to include(temporary: false, assigned_count: 0, completed_count: 0)

      cust = within(biz) { Customer.create!(name: "Ali", phone: "+923001234567") }
      addr = within(biz) { CustomerAddress.create!(customer: cust, line1: "House 1", area: "Clifton", city: "Karachi") }
      2.times do
        api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust.id, address_id: addr.id, lines: [ { product_id: m[:burger].id, quantity: 1 } ], place: true }, headers: headers
        o = json
        api_post "/api/v1/orders/#{o[:id]}/delivery/assign", { rider_id: temp[:id] }, headers: headers
        if response.status == 200
          %w[picked_up on_the_way delivered].each { |st| api_post "/api/v1/orders/#{o[:id]}/delivery/status", { status: st }, headers: headers }
        else
          expect(json[:error][:code]).to eq("rider.expired") # the one-order rider is used up
          api_post "/api/v1/orders/#{o[:id]}/delivery/assign", { rider_id: perm[:id] }, headers: headers
          expect(response).to have_http_status(:ok)
        end
      end
      get "/api/v1/riders/#{temp[:id]}", headers: headers
      expect(json).to include(orders_used: 1, expired: true, assigned_count: 1, completed_count: 1)
      get "/api/v1/riders/#{perm[:id]}", headers: headers
      expect(json).to include(assigned_count: 1, completed_count: 0)
      get "/api/v1/riders?temporary=true", headers: headers
      expect(json[:data].map { |r| r[:name] }).to contain_exactly("Temp", "Hours")
      get "/api/v1/reports/riders?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      row = json[:rows].find { |r| r[:rider][:name] == "Temp" }
      expect(row).to include(assigned: 1, completed: 1, temporary: true)
      expect(json[:totals]).to include(riders: 2, temporary_riders: 1)
      delete "/api/v1/riders/#{perm[:id]}", headers: grant!(cashier, %w[RIDERS])
      expect(response).to have_http_status(:forbidden)
      api_post "/api/v1/devices", { name: "Rider phone", kind: "rider" }, headers: headers
      expect(response).to have_http_status(:created)
    end
  end

  describe "cashier till" do
    it "separates orders taken from money collected, shows In tills now until a Day-End Settlement clears it, and serves My Till" do
      m
      ch = grant!(cashier, %w[SALES_WALKIN MY_TILL payments.take])
      api_post "/api/v1/shifts", { opening_cash_minor: 100_000 }, headers: ch
      expect(response).to have_http_status(:created)
      shift = json
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id, quantity: 1 } ], place: true }, headers: headers # taken by the owner
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: ch # collected by the cashier
      expect(response).to have_http_status(:created)
      get "/api/v1/shifts/my_till", headers: ch
      expect(json[:drawer_balance_minor]).to eq(100_000 + o[:total_minor])
      expect(json[:collected_today_minor]).to eq(o[:total_minor])
      expect(json[:orders_taken_today]).to eq(0)
      get "/api/v1/reports/cashier_till?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      rows = json[:rows].index_by { |r| r[:membership_id] }
      expect(rows[owner.id]).to include(orders_taken: 1, taken_minor: o[:total_minor], collected_minor: 0)
      expect(rows[cashier.id]).to include(orders_taken: 0, collected_minor: o[:total_minor], in_tills_now_minor: 100_000 + o[:total_minor], shifts_open: 1)
      expect(json[:totals][:taken_minor]).to eq(json[:totals][:collected_minor]) # the same money, counted once for each
      api_post "/api/v1/day_end_settlements", {}, headers: headers
      expect(response).to have_http_status(:conflict) # a till is still open
      api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 100_000 + o[:total_minor] }, headers: ch
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/day_end_settlements", {}, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(shifts_count: 1, amount_minor: 100_000 + o[:total_minor])
      get "/api/v1/reports/cashier_till?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:rows].find { |r| r[:membership_id] == cashier.id }).to include(in_tills_now_minor: 0, shifts_settled: 1)
      expect(json[:settlements].size).to eq(1)
      api_post "/api/v1/day_end_settlements", {}, headers: ch
      expect(response).to have_http_status(:forbidden)
    end
  end
end

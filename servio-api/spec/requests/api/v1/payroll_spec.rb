require "rails_helper"

RSpec.describe "Payroll and attendance", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  it "sets up employees, rules, leave and holidays, tracks attendance with lateness and fines" do
    api_post "/api/v1/employees/departments", { name: "Kitchen" }, headers: headers
    dept = json[:id]
    api_post "/api/v1/employees/components", { name: "House rent", kind: "earning", default_amount_minor: 500_000 }, headers: headers
    rent = json[:id]
    api_post "/api/v1/employees/components", { name: "EOBI", kind: "deduction", is_percent: true, percent: 1 }, headers: headers
    eobi = json[:id]
    api_put "/api/v1/employees/rules", { shift_start: "10:00", shift_end: "22:00", grace_minutes: 15, late_fine_minor: 20_000, late_fine_after_minutes: 30, absent_rule: "calendar_days", working_days: [1, 2, 3, 4, 5, 6] }, headers: headers
    expect(response).to have_http_status(:ok)
    cashier = add_member!(biz, "cashier", pin: "1234")
    api_post "/api/v1/employees", { name: "Ali Raza", cnic: "35202-1234567-1", designation: "Cook", department_id: dept, membership_id: cashier.id, base_salary_minor: 5_200_000, joined_on: "2026-01-01", shares_tips: true,
                                    components: [{ salary_component_id: rent }, { salary_component_id: eobi }] }, headers: headers
    expect(response).to have_http_status(:created)
    emp = json
    expect(emp[:components].size).to eq(2)
    api_post "/api/v1/employees/leaves", { employee_id: emp[:id], kind: "unpaid", from_date: "2026-09-03", to_date: "2026-09-04", reason: "Family" }, headers: headers
    leave = json
    api_post "/api/v1/employees/leaves/#{leave[:id]}/decide", { approve: true }, headers: headers
    expect(json[:status]).to eq("approved")
    api_post "/api/v1/employees/holidays", { name: "Defence Day", on_date: "2026-09-06", paid: true }, headers: headers
    expect(response).to have_http_status(:created)

    travel_to Time.zone.parse("2026-09-01 10:50 +0500") do
      api_post "/api/v1/attendance/check_in", { pin: "1234", source: "pin" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:late_minutes]).to eq(50) # SPEC: minutes from shift start, judged on the first scan
      expect(json[:status]).to eq("late")
      expect(json[:fine_minor]).to eq(20_000)
      api_post "/api/v1/attendance/check_in", { employee_id: emp[:id] }, headers: headers
      expect(response).to have_http_status(:conflict)
    end
    travel_to Time.zone.parse("2026-09-01 22:10 +0500") do
      api_post "/api/v1/attendance/check_out", { employee_id: emp[:id] }, headers: headers
      expect(json[:worked_minutes]).to eq(680)
    end
    travel_to Time.zone.parse("2026-09-02 10:05 +0500") do
      api_post "/api/v1/attendance/check_in", { employee_id: emp[:id], source: "fingerprint" }, headers: headers
      expect(json[:late_minutes]).to eq(0)
    end
    api_post "/api/v1/attendance/fill_absences", { from: "2026-09-01", to: "2026-09-08" }, headers: headers
    expect(json[:filled]).to eq(6) # 3,4 leave; 5 absent; 6 holiday (a Sunday, named as the holiday rather than a weekly off); 7, 8 absent
    get "/api/v1/attendance?from=2026-09-01&to=2026-09-08&employee_id=#{emp[:id]}", headers: headers
    statuses = json[:data].sort_by { |a| a[:business_day] }.map { |a| a[:status] }
    expect(statuses).to eq(%w[late present leave leave absent holiday absent absent]) # SPEC: Late is a stored status; off days get their own row
    get "/api/v1/attendance/summary?month=2026-09", headers: headers
    s = json[:data].first[:summary]
    expect(s).to include(present: 2, absent: 3, leave: 2, unpaid_leave: 2, late_days: 1, fines_minor: 20_000)
  end

  it "generates payroll with pro-rating, absence deduction, fines, advances, tips and commission, then pays it as salary expenses" do
    api_post "/api/v1/employees/components", { name: "Allowance", kind: "earning", default_amount_minor: 200_000 }, headers: headers
    allowance = json[:id]
    api_put "/api/v1/employees/rules", { absent_rule: "fixed_26", late_fine_minor: 10_000, late_fine_after_minutes: 0, grace_minutes: 0 }, headers: headers
    cashier = add_member!(biz, "cashier", pin: "2468")
    api_post "/api/v1/employees", { name: "Sana", base_salary_minor: 2_600_000, joined_on: "2026-01-01", membership_id: cashier.id, shares_tips: true, components: [{ salary_component_id: allowance }] }, headers: headers
    sana = json
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/employees", { name: "Newbie", base_salary_minor: 3_000_000, joined_on: "2026-09-16" }, headers: headers
    newbie = json
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/attendance/mark", { employee_id: sana[:id], business_day: "2026-09-02", status: "absent" }, headers: headers
    api_post "/api/v1/attendance/mark", { employee_id: sana[:id], business_day: "2026-09-03", status: "absent" }, headers: headers
    within(biz) { Employee.find(newbie[:id]); (Date.new(2026, 9, 1)..Date.new(2026, 9, 30)).each { |d| Attendance.create!(employee_id: sana[:id], business_day: d, status: "present", source: "manual") unless Attendance.exists?(employee_id: sana[:id], business_day: d) } }
    within(biz) { (Date.new(2026, 9, 16)..Date.new(2026, 9, 30)).each { |d| Attendance.create!(employee_id: newbie[:id], business_day: d, status: "present", source: "manual") } }
    within(biz) { Attendance.find_by!(employee_id: sana[:id], business_day: Date.new(2026, 9, 4)).update!(status: "late", late_minutes: 20, fine_minor: 10_000) }

    api_post "/api/v1/payroll/advances", { employee_id: sana[:id], amount_minor: 300_000, reason: "Medical", installment_minor: 100_000 }, headers: headers
    adv = json
    expect(response).to have_http_status(:created), response.body
    expect(adv[:status]).to eq("pending")
    api_post "/api/v1/payroll/advances/#{adv[:id]}/decide", { approve: true }, headers: headers
    api_post "/api/v1/payroll/advances/#{adv[:id]}/pay", { method_code: "cash" }, headers: headers
    expect(json[:status]).to eq("paid")
    expect(json[:expense_id]).to be_present
    cash = within(biz) { PaymentAccount.find_by!(kind: "cash") }
    expect(cash.reload.current_balance_minor).to eq(-300_000)

    m = build_menu!(biz)
    travel_to Time.zone.parse("2026-09-10 13:00 +0500") do
      api_post "/api/v1/orders", { order_type: "takeaway", lines: [{ product_id: m[:chai].id }], place: true }, headers: auth_headers(cashier, app: "pos")
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { tip_minor: 5_000, payments: [{ method_code: "cash", amount_minor: o[:total_minor] + 5_000 }] }, headers: auth_headers(cashier, app: "pos")
      expect(response).to have_http_status(:created)
    end
    api_post "/api/v1/commission_rules", { name: "Rs 5 per order", applies_to: "order_taker", basis: "per_order", value: 5 }, headers: headers

    api_post "/api/v1/payroll/runs", { month: "2026-09" }, headers: headers
    expect(response).to have_http_status(:created)
    run = json
    expect(run[:employees_count]).to eq(2)
    ps = run[:payslips].find { |p| p[:employee_name] == "Sana" }
    expect(ps[:base_minor]).to eq(2_600_000)
    expect(ps[:absence_minor]).to eq(200_000) # 2 days at 2,600,000 / 26
    expect(ps[:late_fines_minor]).to eq(10_000)
    expect(ps[:tips_minor]).to eq(5_000)
    expect(ps[:commission_minor]).to eq(500)
    expect(ps[:earnings_minor]).to eq(200_000 + 5_000 + 500)
    expect(ps[:advances_recovered_minor]).to eq(100_000)
    expect(ps[:net_minor]).to eq(2_600_000 + 205_500 - 200_000 - 10_000 - 100_000)
    nb = run[:payslips].find { |p| p[:employee_name] == "Newbie" }
    expect(nb[:base_minor]).to eq(1_500_000)
    expect(nb[:days_present]).to eq(15)
    api_post "/api/v1/payroll/runs", { month: "2026-09" }, headers: headers
    expect(response).to have_http_status(:conflict)

    api_post "/api/v1/payroll/runs/#{run[:id]}/pay", { method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("paid")
    expect(within(biz) { Expense.where(source: "payroll_sync").count }).to eq(3)
    expect(cash.reload.current_balance_minor).to eq(-300_000 + 9_280 + 5_000 - ps[:net_minor] - nb[:net_minor])
    get "/api/v1/payroll/advances?employee_id=#{sana[:id]}", headers: headers
    expect(json[:data].first[:outstanding_minor]).to eq(200_000)
    get "/api/v1/payroll/runs/#{run[:id]}", headers: headers
    expect(json[:payslips].all? { |p| p[:paid_at].present? }).to be true
  end

  it "blocks closing a shift without a fingerprint check-in when the rule requires it" do
    cashier = add_member!(biz, "cashier", pin: "1111")
    api_post "/api/v1/employees", { name: "Till Cashier", base_salary_minor: 1_000_000, membership_id: cashier.id }, headers: headers
    emp = json
    api_put "/api/v1/employees/rules", { employee_id: emp[:id], require_fingerprint_to_close_shift: true }, headers: headers
    expect(json[:require_fingerprint_to_close_shift]).to be true
    api_post "/api/v1/shifts", { opening_cash_minor: 100_000 }, headers: auth_headers(cashier, app: "pos")
    expect(response).to have_http_status(:created)
    shift = json
    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 100_000 }, headers: auth_headers(cashier, app: "pos")
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("shift.fingerprint_required")
    api_post "/api/v1/attendance/check_in", { employee_id: emp[:id], source: "fingerprint" }, headers: headers
    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 100_000 }, headers: auth_headers(cashier, app: "pos")
    expect(response).to have_http_status(:ok)
  end
end

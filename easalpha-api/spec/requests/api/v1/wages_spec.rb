require "rails_helper"

# Daily and weekly wages, advance recovery, voids, the employee statement and WhatsApp messages to staff (12 Oct 2026).
RSpec.describe "Wages and the employee statement", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def employee!(attrs = {})
    api_post "/api/v1/employees", { name: "Akram", phone: "+923004445566", base_salary_minor: 150_000, pay_frequency: "daily", joined_on: (today - 60).to_s }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def advance!(emp, amount)
    api_post "/api/v1/payroll/advances", { employee_id: emp[:id], amount_minor: amount, reason: "Family need" }, headers: headers
    adv = json
    api_post "/api/v1/payroll/advances/#{adv[:id]}/decide", { approve: true }, headers: headers
    api_post "/api/v1/payroll/advances/#{adv[:id]}/pay", { method_code: "cash" }, headers: headers
    expect(response.status).to be_between(200, 201), response.body[0, 300]
    adv
  end

  it "pays a daily wage once per day as a Wages expense, recovers an advance, voids it, and keeps daily staff out of the monthly run" do
    emp = employee!
    advance!(emp, 100_000)
    within(biz) { WhatsappMessage.delete_all }

    get "/api/v1/wages/due", params: { day: today.to_s }, headers: headers
    row = json[:data].find { |r| r[:employee_id] == emp[:id] }
    expect(row).to include(days_worked: 1.0, gross_minor: 150_000, advances_outstanding_minor: 100_000, paid: nil, attendance_tracked: false)

    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s, bonus_minor: 20_000, advance_recovery_minor: 30_000 }, headers: headers
    expect(response).to have_http_status(:created), response.body
    w = json
    expect(w).to include(gross_minor: 150_000, bonus_minor: 20_000, advance_recovered_minor: 30_000, net_minor: 140_000, status: "paid")
    within(biz) do
      e = Expense.find(w[:expense_id])
      expect(e.amount_minor).to eq(140_000)
      expect(e.category.name).to eq("Wages")
      expect(e.category.parent.name).to eq("Salaries")
      expect(Advance.find_by(employee_id: emp[:id]).outstanding_minor).to eq(70_000)
      msg = WhatsappMessage.find_by(template_name: "employee_wage_paid")
      expect(msg.to_phone).to eq("+923004445566")
      expect(msg.variables["text"]).to include("Rs 1,500", "bonus Rs 200", "advance Rs 300", "Paid Rs 1,400", "outstanding: Rs 700")
    end

    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("wages.already_paid")
    api_post "/api/v1/wages", { employee_id: emp[:id], from: (today - 1).to_s, advance_recovery_minor: 80_000 }, headers: headers
    expect(json[:error][:code]).to eq("wages.recovery")
    api_post "/api/v1/wages", { employee_id: emp[:id], from: (today - 1).to_s, deductions_minor: 200_000 }, headers: headers
    expect(json[:error][:code]).to eq("wages.net")

    api_post "/api/v1/wages/#{w[:id]}/void", { reason: "Paid the wrong person" }, headers: headers
    expect(json[:status]).to eq("voided")
    within(biz) do
      expect(Expense.find(w[:expense_id]).voided_at).to be_present
      expect(Advance.find_by(employee_id: emp[:id]).outstanding_minor).to eq(100_000)
    end
    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s, days_worked: 0.5 }, headers: headers
    expect(json).to include(days_worked: 0.5, gross_minor: 75_000, net_minor: 75_000)

    monthly = employee!(name: "Saima", pay_frequency: "monthly", base_salary_minor: 3_000_000, phone: "+923007778899")
    api_post "/api/v1/payroll/runs", { month: today.strftime("%Y-%m") }, headers: headers
    expect(response).to have_http_status(:created), response.body[0, 300]
    names = json[:payslips].map { |p| p[:employee_name] || p.dig(:employee, :name) }
    expect(names).to include("Saima")
    expect(names).not_to include("Akram")
    run = json
    within(biz) { WhatsappMessage.delete_all }
    api_post "/api/v1/payroll/runs/#{run[:id]}/pay", { method_code: "cash" }, headers: headers
    expect(response.status).to be_between(200, 201), response.body[0, 300]
    msg = within(biz) { WhatsappMessage.find_by(template_name: "employee_salary_paid") }
    expect(msg.to_phone).to eq(monthly[:phone])
    expect(msg.variables["text"]).to include("salary for #{today.strftime('%B %Y')} was paid")
  end

  it "prices a weekly wage from attendance (weekly off and holidays paid) and pays a whole day's batch" do
    weekly = employee!(name: "Naveed", pay_frequency: "weekly", base_salary_minor: 700_000, phone: nil)
    daily = employee!(name: "Bashir", phone: nil)
    monday = today.beginning_of_week
    within(biz) do
      { 0 => "present", 1 => "late", 2 => "half_day", 3 => "absent", 4 => "present", 5 => "present", 6 => "weekly_off" }.each do |i, st|
        Attendance.create!(employee_id: weekly[:id], business_day: monday + i, status: st, source: "manual")
      end
    end
    get "/api/v1/wages/preview", params: { employee_id: weekly[:id], from: monday.to_s, to: (monday + 6).to_s }, headers: headers
    expect(json).to include(attendance_tracked: true, days_worked: 5.5, gross_minor: 550_000)

    api_post "/api/v1/wages/batch", { day: monday.to_s, rows: [ { employee_id: weekly[:id] }, { employee_id: daily[:id], days_worked: 1 }, { employee_id: SecureRandom.uuid } ] }, headers: headers
    expect(json).to include(paid: 2, failed: 1)
    get "/api/v1/wages", params: { from: monday.to_s, to: (monday + 6).to_s }, headers: headers
    expect(json[:totals]).to include(count: 2, net_minor: 550_000 + 150_000)
    expect(within(biz) { WhatsappMessage.where(template_name: "employee_wage_paid").count }).to eq(0) # no phones
  end

  it "builds the employee statement: earned, paid and advances with a running balance, and sends it" do
    emp = employee!(name: "Rafiq", phone: "+923001231234")
    advance!(emp, 50_000)
    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s, advance_recovery_minor: 50_000 }, headers: headers
    api_post "/api/v1/wages", { employee_id: emp[:id], from: (today - 1).to_s, gross_minor: 120_000, note: "left early" }, headers: headers
    get "/api/v1/employees/#{emp[:id]}/statement", params: { from: (today - 5).to_s, to: today.to_s }, headers: headers
    st = json
    expect(st[:totals]).to include(earned_minor: 270_000, paid_minor: 220_000, advances_minor: 50_000, recovered_minor: 50_000)
    expect(st[:closing_balance_minor]).to eq(0)
    expect(st[:advances_outstanding_minor]).to eq(0)
    expect(st[:entries].map { |e| e[:kind] }).to include("advance", "wage", "wage_paid")

    within(biz) { WhatsappMessage.delete_all }
    api_post "/api/v1/employees/#{emp[:id]}/send_statement", { from: (today - 5).to_s, to: today.to_s }, headers: headers
    expect(response).to have_http_status(:conflict) # no phone linked: not reported as sent
    expect(json[:error][:code]).to eq("whatsapp.not_connected")
    allow(Whatsapp::Provider).to receive(:live?).and_return(true) # a phone is linked
    api_post "/api/v1/employees/#{emp[:id]}/send_statement", { from: (today - 5).to_s, to: today.to_s }, headers: headers
    expect(response).to have_http_status(:created)
    expect(within(biz) { WhatsappMessage.find_by(template_name: "employee_statement").variables["text"] }).to include("earned Rs 2,700", "Nothing is due")
  end

  it "lets a manager pay wages, honours the switches, and refuses while payroll is off" do
    emp = employee!
    manager = add_member!(biz, "manager")
    within(biz) { Setting.write!(biz, { "payroll.whatsapp.wage_paid" => false }) }
    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s }, headers: auth_headers(manager)
    expect(response).to have_http_status(:created), response.body
    expect(within(biz) { WhatsappMessage.where(template_name: "employee_wage_paid").count }).to eq(0)
    cashier = add_member!(biz, "cashier")
    get "/api/v1/wages/due", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    set_modules!(biz, payroll: false)
    get "/api/v1/wages/due", headers: headers
    expect(json[:error][:code]).to eq("module.disabled")
  end

  it "gives a manager who only pays wages the wage staff, and keeps salary statements with payroll managers" do
    daily = employee!
    monthly = employee!(name: "Saima", pay_frequency: "monthly", base_salary_minor: 3_000_000)
    clerk = add_member!(biz, "manager")
    within(biz) { clerk.set_permissions!(%w[app.admin wages.pay]) } # a custom role that may pay wages but not see payroll
    mh = auth_headers(clerk.reload)
    get "/api/v1/wages/employees", headers: mh
    expect(json[:scope]).to eq("wage_staff")
    expect(json[:data].map { |e| e[:id] }).to eq([ daily[:id] ])
    get "/api/v1/wages/employees", headers: headers
    expect(json[:scope]).to eq("all")
    expect(json[:data].map { |e| e[:name] }).to include("Akram", "Saima")
    get "/api/v1/employees/#{monthly[:id]}/statement", headers: mh
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/employees/#{daily[:id]}/statement", headers: mh
    expect(response).to have_http_status(:ok)
    get "/api/v1/employees/#{monthly[:id]}/statement", headers: headers
    expect(response).to have_http_status(:ok)
  end

  it "accepts only monthly, weekly or daily" do
    api_post "/api/v1/employees", { name: "X", pay_frequency: "hourly" }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
  end

  # Scans write only the days someone checked in; weekly offs, holidays, leave and absences get rows only when a payroll
  # run fills them. So the wage preview classifies a day without a row itself, by the payroll run's own rule.
  describe "days worked when only check-ins exist" do
    let(:monday) { Date.new(2026, 9, 7) }

    def at(day, hour) = Time.use_zone(within(biz) { Branch.first.time_zone }) { Time.zone.local(day.year, day.month, day.day, hour) }
    def scan!(emp, *days) = days.each { |d| within(biz) { Payroll::Attendance.check_in!(Employee.find(emp[:id]), at: at(d, 9), source: "fingerprint") } }

    def due_on(day)
      get "/api/v1/wages/due", params: { day: day.to_s }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      json[:data].index_by { |r| r[:employee_name] }
    end

    before { api_put "/api/v1/employees/rules", { shift_start: "10:00", shift_end: "18:00" }, headers: headers } # Monday to Saturday, Sunday off

    it "pays a weekly employee who scans Monday to Saturday the whole week, the weekly off included, without writing rows" do
      weekly = employee!(name: "Naveed", pay_frequency: "weekly", base_salary_minor: 700_000, phone: nil, joined_on: "2026-01-01")
      scan!(weekly, monday, monday + 1, monday + 2)
      travel_to(at(monday + 2, 20)) do # Wednesday evening: Thursday to Saturday have not happened yet
        r = due_on(monday + 2)["Naveed"]
        expect(r).to include(attendance_tracked: true, days_worked: 4.0, gross_minor: 400_000)
        expect(r[:attendance].map { |a| a[:status] }).to eq(%w[present present present weekly_off])
      end
      scan!(weekly, monday + 3, monday + 4, monday + 5)
      travel_to(at(monday + 5, 20)) do # Saturday evening, when the week is paid
        r = due_on(monday + 5)["Naveed"]
        expect(r).to include(attendance_tracked: true, days_worked: 7.0, gross_minor: 700_000)
        expect(r[:attendance].count { |a| a[:status] == "present" && a[:recorded] }).to eq(6)
        expect(r[:attendance].last).to eq(day: (monday + 6).to_s, status: "weekly_off", recorded: false)
        api_post "/api/v1/wages/batch", { day: (monday + 5).to_s, rows: [ { employee_id: weekly[:id] } ] }, headers: headers
        expect(json[:results].first).to include(ok: true)
        expect(json[:results].first[:wage]).to include(days_worked: 7.0, gross_minor: 700_000, net_minor: 700_000)
      end
      expect(within(biz) { Attendance.where(employee_id: weekly[:id]).pluck(:status) }).to eq(%w[present] * 6) # the preview wrote nothing
    end

    it "counts a daily worker who keeps attendance absent on a day without a scan, and every day for one who keeps none" do
      bashir = employee!(name: "Bashir", phone: nil, joined_on: "2026-01-01")
      saleem = employee!(name: "Saleem", phone: nil, joined_on: "2026-01-01")
      employee!(name: "Gul", phone: nil, joined_on: "2026-01-01") # keeps no attendance
      api_post "/api/v1/attendance/enrol", { employee_id: saleem[:id], fingerprint_id: "FP-31" }, headers: headers # enrolled, has not scanned yet
      expect(response).to have_http_status(:ok), response.body
      scan!(bashir, monday, monday + 1)
      travel_to(at(monday + 2, 20)) do # Wednesday evening: Bashir and Saleem did not come
        due = due_on(monday + 2)
        expect(due["Bashir"]).to include(attendance_tracked: true, days_worked: 0.0, gross_minor: 0, attendance: [ { day: (monday + 2).to_s, status: "absent", recorded: false } ])
        expect(due["Saleem"]).to include(attendance_tracked: true, days_worked: 0.0, gross_minor: 0)
        expect(due["Gul"]).to include(attendance_tracked: false, days_worked: 1.0, gross_minor: 150_000, attendance: [])
        expect(due_on(monday + 1)["Bashir"]).to include(days_worked: 1.0, gross_minor: 150_000)
      end
      travel_to(at(monday + 6, 20)) do # Sunday is his weekly off: not a day worked
        expect(due_on(monday + 6)["Bashir"]).to include(days_worked: 0.0, gross_minor: 0, attendance: [ { day: (monday + 6).to_s, status: "weekly_off", recorded: false } ])
      end
      expect(within(biz) { Attendance.where(employee_id: [ bashir[:id], saleem[:id] ]).count }).to eq(2)
    end

    it "counts each day as a payroll run fills it, and ignores the run's rows for staff who keep no attendance" do
      naveed = employee!(name: "Naveed", pay_frequency: "weekly", base_salary_minor: 700_000, phone: nil, joined_on: "2026-01-01")
      bashir = employee!(name: "Bashir", phone: nil, joined_on: "2026-01-01")
      gul = employee!(name: "Gul", phone: nil, joined_on: "2026-01-01")
      api_put "/api/v1/employees/rules", { employee_id: bashir[:id], no_scan_counts_absent: false }, headers: headers # a no-scan day is not absent for him
      api_post "/api/v1/employees/holidays", { name: "Closed for repairs", on_date: (monday + 2).to_s, paid: true }, headers: headers
      api_post "/api/v1/employees/leaves", { employee_id: naveed[:id], kind: "paid", from_date: (monday + 4).to_s, to_date: (monday + 4).to_s, reason: "Wedding" }, headers: headers
      api_post "/api/v1/employees/leaves/#{json[:id]}/decide", { approve: true }, headers: headers
      scan!(naveed, monday, monday + 1, monday + 3) # no scan on Saturday
      scan!(bashir, monday)
      week = lambda do
        get "/api/v1/wages/preview", params: { employee_id: naveed[:id], from: monday.to_s, to: (monday + 6).to_s }, headers: headers
        json
      end

      was = week.call
      expect(was).to include(attendance_tracked: true, days_worked: 6.0, gross_minor: 600_000)
      expect(was[:attendance].map { |a| a[:status] }).to eq(%w[present present holiday present leave absent weekly_off])
      saturday = due_on(monday + 5)
      expect(saturday["Bashir"]).to include(attendance_tracked: true, days_worked: 0.0, attendance: [])
      expect(saturday["Gul"]).to include(attendance_tracked: false, days_worked: 1.0)

      api_post "/api/v1/attendance/fill_absences", { from: monday.to_s, to: (monday + 6).to_s }, headers: headers
      now = week.call
      expect(now.except(:attendance)).to eq(was.except(:attendance))
      expect(now[:attendance].map { |a| a.except(:recorded) }).to eq(was[:attendance].map { |a| a.except(:recorded) })
      expect(now[:attendance].map { |a| a[:recorded] }).to all(be(true))
      expect(within(biz) { Attendance.where(employee_id: bashir[:id], business_day: monday + 5).exists? }).to be(false)
      expect(within(biz) { Attendance.find_by!(employee_id: gul[:id], business_day: monday + 5).status }).to eq("absent") # the run marked him absent,
      expect(due_on(monday + 5)["Gul"]).to include(attendance_tracked: false, days_worked: 1.0, gross_minor: 150_000) # but he keeps no attendance
    end

    it "does not pay a weekly employee for approved unpaid leave, before or after a payroll run fills the days" do
      naveed = employee!(name: "Naveed", pay_frequency: "weekly", base_salary_minor: 700_000, phone: nil, joined_on: "2026-01-01")
      api_post "/api/v1/employees/leaves", { employee_id: naveed[:id], kind: "unpaid", from_date: (monday + 2).to_s, to_date: (monday + 3).to_s, reason: "Village" }, headers: headers
      api_post "/api/v1/employees/leaves/#{json[:id]}/decide", { approve: true }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      scan!(naveed, monday, monday + 1, monday + 4, monday + 5)
      week = lambda do
        get "/api/v1/wages/preview", params: { employee_id: naveed[:id], from: monday.to_s, to: (monday + 6).to_s }, headers: headers
        json
      end

      travel_to(at(monday + 5, 20)) do
        expect(week.call).to include(days_worked: 5.0, gross_minor: 500_000)
        expect(json[:attendance].map { |a| a[:status] }).to eq(%w[present present leave leave present present weekly_off])
        api_post "/api/v1/attendance/fill_absences", { from: monday.to_s, to: (monday + 6).to_s }, headers: headers
        expect(week.call).to include(days_worked: 5.0, gross_minor: 500_000)
      end
    end
  end

  it "voids a wage whose expense was voided on the Expenses screen, and sends a wage's expense to Pay Wages" do
    emp = employee!(name: "Rafiq", phone: nil)
    adv = advance!(emp, 100_000)
    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s, advance_recovery_minor: 30_000 }, headers: headers
    w = json
    expect(w).to include(net_minor: 120_000, status: "paid")
    cash = within(biz) { PaymentAccount.find_by!(kind: "cash") }
    paid_balance = cash.reload.current_balance_minor

    # Voiding it on the Expenses screen would leave the advance recovered and the wage paid, so it points to Pay Wages.
    api_post "/api/v1/expenses/#{w[:expense_id]}/void", { reason: "Paid twice" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("expense.wage")
    expect(json[:error][:message]).to include(w[:label], "Rafiq", "Pay Wages")
    expect(within(biz) { Expense.find(w[:expense_id]).voided? }).to be(false)

    # One voided there before that was refused: the wage still voids, gives the advance back once, and frees the day.
    within(biz) { Expenses::Recorder.void!(Expense.find(w[:expense_id]), actor: owner, reason: "Paid twice") }
    expect(cash.reload.current_balance_minor).to eq(paid_balance + 120_000)
    api_post "/api/v1/wages/#{w[:id]}/void", { reason: "Paid twice" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("voided")
    expect(cash.reload.current_balance_minor).to eq(paid_balance + 120_000) # not reversed a second time
    expect(within(biz) { Advance.find(adv[:id]).outstanding_minor }).to eq(100_000)
    api_post "/api/v1/wages/#{w[:id]}/void", { reason: "Again" }, headers: headers
    expect(json[:error][:code]).to eq("wages.voided")
    expect(within(biz) { Advance.find(adv[:id]).outstanding_minor }).to eq(100_000)
    api_post "/api/v1/wages", { employee_id: emp[:id], from: today.to_s }, headers: headers
    expect(response).to have_http_status(:created), response.body

    # Other payroll expenses, such as the advance itself, have no void of their own and still void from Expenses.
    api_post "/api/v1/expenses/#{within(biz) { Advance.find(adv[:id]).expense_id }}/void", { reason: "Entered twice" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end
end

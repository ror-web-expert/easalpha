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
end

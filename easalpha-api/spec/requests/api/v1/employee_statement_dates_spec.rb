require "rails_helper"

# A weekly wage paid before the week ends is earned and paid on the same business day, so a statement that ends between
# the pay day and the end of the week never shows the pay without the wage (13 Oct 2026).
RSpec.describe "Employee statement dates", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  it "puts a week paid on Saturday into the month that holds the Saturday, as earned and paid" do
    api_post "/api/v1/employees", { name: "Bashir", phone: "+923004445577", base_salary_minor: 700_000, pay_frequency: "weekly", joined_on: "2026-09-01" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    emp = json
    within(biz) do
      branch = Branch.first
      employee = Employee.find(emp[:id])
      employee.update!(branch: branch)
      # Mon 26 Oct to Sun 1 Nov 2026, paid Sat 31 Oct at 8 pm Karachi time.
      WagePayment.create!(employee: employee, branch_id: branch.id, number: DocumentCounter.next!("wage_payment"), period_from: Date.new(2026, 10, 26), period_to: Date.new(2026, 11, 1),
                          days_worked: 7, rate_minor: 700_000, gross_minor: 700_000, net_minor: 700_000, status: "paid", method_code: "cash", paid_at: Time.find_zone!(branch.time_zone).parse("2026-10-31 20:00"))
      october = Payroll::Statement.build(employee, from: Date.new(2026, 10, 1), to: Date.new(2026, 10, 31))
      expect(october[:entries].map { |e| [ e[:kind], e[:date] ] }).to eq([ [ "wage", Date.new(2026, 10, 31) ], [ "wage_paid", Date.new(2026, 10, 31) ] ])
      expect(october[:closing_balance_minor]).to eq(0)
      november = Payroll::Statement.build(employee, from: Date.new(2026, 11, 1), to: Date.new(2026, 11, 30))
      expect(november[:entries]).to be_empty
      expect(november[:brought_forward_minor]).to eq(0)
    end
  end
end

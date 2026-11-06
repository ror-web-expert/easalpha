require "rails_helper"

# Leftovers of 7 Nov 2026, L2: GET /employees answered staff.manage with every salary and POST and PATCH took a salary
# from it, so the Manager, who holds no payroll since migration 20261107100000, read and set pay. Pay needs
# payroll.manage or PAYROLL; staff.manage keeps the employee list and profile without pay, departments, attendance
# rules, leave and holidays.
RSpec.describe "Employee pay needs the payroll permission", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:manager) { add_member!(biz, "manager") }
  let(:mh) { auth_headers(manager) }

  def add_employee!
    api_post "/api/v1/employees/components", { name: "House rent", kind: "earning", default_amount_minor: 500_000 }, headers: headers
    rent = json[:id]
    api_post "/api/v1/employees", { name: "Ali Raza", designation: "Cook", base_salary_minor: 5_200_000, shares_tips: true,
                                    components: [ { salary_component_id: rent, amount_minor: 400_000 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def stored(emp) = within(biz) { Employee.find(emp[:id]) }

  it "shows a Manager the team without pay and refuses any pay they send" do
    emp = add_employee!
    get "/api/v1/employees", headers: mh
    expect(response).to have_http_status(:ok)
    expect(json[:data].first).to include(name: "Ali Raza", designation: "Cook", pay_frequency: "monthly", shares_tips: true)
    expect(json[:data].first.keys).not_to include(:base_salary_minor, :components)
    get "/api/v1/employees/#{emp[:id]}", headers: mh
    expect(json.keys).not_to include(:base_salary_minor, :components)
    expect(response.body).not_to include("5200000", "400000")

    { base_salary_minor: 9_900_000, pay_frequency: "daily", shares_tips: false, components: [] }.each do |key, value|
      api_patch "/api/v1/employees/#{emp[:id]}", { designation: "Head cook", key => value }, headers: mh
      expect(response).to have_http_status(:forbidden), "#{key}: #{response.body}"
      expect(json[:error]).to include(code: "permission.denied")
      expect(json[:error][:message]).to include("payroll.manage", key.to_s)
    end
    expect(stored(emp)).to have_attributes(designation: "Cook", base_salary_minor: 5_200_000, pay_frequency: "monthly", shares_tips: true)
    expect(within(biz) { EmployeeSalaryComponent.where(employee_id: emp[:id]).pluck(:amount_minor) }).to eq([ 400_000 ])
    api_post "/api/v1/employees", { name: "Bilal", base_salary_minor: 100 }, headers: mh
    expect(response).to have_http_status(:forbidden)
    expect(within(biz) { Employee.where(name: "Bilal").count }).to eq(0)
  end

  it "keeps the HR side with staff.manage: profile edits, a new employee, departments, rules, leave, holidays and enrolment" do
    emp = add_employee!
    api_patch "/api/v1/employees/#{emp[:id]}", { designation: "Head cook", phone: "+923001112233" }, headers: mh
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(designation: "Head cook")
    expect(json.keys).not_to include(:base_salary_minor, :components)
    expect(stored(emp)).to have_attributes(base_salary_minor: 5_200_000, shares_tips: true)
    expect(within(biz) { EmployeeSalaryComponent.where(employee_id: emp[:id]).count }).to eq(1) # a save without components keeps them

    api_post "/api/v1/employees", { name: "Bilal", designation: "Waiter" }, headers: mh
    expect(response).to have_http_status(:created), response.body
    expect(within(biz) { Employee.find_by!(name: "Bilal") }).to have_attributes(base_salary_minor: 0, pay_frequency: "monthly") # payroll sets the pay

    api_post "/api/v1/employees/departments", { name: "Kitchen" }, headers: mh
    expect(response).to have_http_status(:created)
    api_put "/api/v1/employees/rules", { grace_minutes: 10 }, headers: mh
    expect(response).to have_http_status(:ok)
    api_post "/api/v1/employees/leaves", { employee_id: emp[:id], kind: "sick", from_date: "2026-11-10", to_date: "2026-11-10" }, headers: mh
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/employees/holidays", { name: "Iqbal Day", on_date: "2026-11-09", paid: true }, headers: mh
    expect(response).to have_http_status(:created)
    api_post "/api/v1/attendance/enrol", { employee_id: emp[:id], fingerprint_id: "7" }, headers: mh
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(fingerprint_enrolled: true)
    expect(json.keys).not_to include(:base_salary_minor, :components)

    get "/api/v1/employees/components", headers: mh
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/employees/components", { name: "Fuel", kind: "earning", default_amount_minor: 100_000 }, headers: mh
    expect(response).to have_http_status(:forbidden)
    rent = within(biz) { SalaryComponent.find_by!(name: "House rent") }
    delete "/api/v1/employees/components/#{rent.id}", headers: mh
    expect(response).to have_http_status(:forbidden)
    expect(rent.reload.archived_at).to be_nil
  end

  it "gives the owner and a role holding PAYROLL the pay, and lets them set it" do
    emp = add_employee!
    clerk = add_member!(biz, "manager")
    within(biz) { clerk.set_permissions!(%w[app.admin PAYROLL]) } # the SPEC code alone, which implies payroll.manage
    [ headers, auth_headers(clerk.reload) ].each_with_index do |h, i|
      get "/api/v1/employees/#{emp[:id]}", headers: h
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(base_salary_minor: 5_200_000 + i)
      expect(json[:components].map { |c| c[:amount_minor] }).to eq(i.zero? ? [ 400_000 ] : [])
      api_patch "/api/v1/employees/#{emp[:id]}", { base_salary_minor: 5_200_001 + i, pay_frequency: "monthly", shares_tips: false, components: [] }, headers: h
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(base_salary_minor: 5_200_001 + i, shares_tips: false, components: [])
      get "/api/v1/employees/components", headers: h
      expect(response).to have_http_status(:ok)
    end
    expect(stored(emp).base_salary_minor).to eq(5_200_002)
  end
end

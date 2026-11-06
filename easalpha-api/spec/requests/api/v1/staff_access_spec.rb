require "rails_helper"

# QA of 6 Nov 2026 (night): P4 a person in two businesses was locked out of the admin; P7 GET /staff gave every token
# everyone's contact details; S4 the Manager preset took admin access away; S5 a second cashier got a PIN already in use.
RSpec.describe "Staff access: logins across businesses, the staff list, presets, PINs", type: :request do
  let!(:owner) { signup_business(name: "Grill One") }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:role) { ->(key, b = biz) { within(b) { Role.find_by!(system_key: key) } } }

  def login(email, **extra)
    api_post "/api/v1/auth/login", { email: email, password: "password123", app: "admin" }.merge(extra)
    response.status
  end

  describe "P4: signing in to the admin with memberships in two businesses" do
    let(:person) { create(:user, email: "two.jobs@example.com", password: "password123") }
    let!(:second) { signup_business(name: "Tea Two") }

    it "lands where the admin opens, not in the newest membership, which is a till job" do
      within(biz) { Membership.create!(user: person, role: role.("manager"), status: "active") }
      travel 1.minute
      within(second.business) { Membership.create!(user: person, role: role.("cashier", second.business), status: "active") }
      expect(login(person.email)).to eq(200)
      expect(json[:business][:id]).to eq(biz.id)
      expect(json[:businesses].map { |b| [ b[:name], b[:apps] ] }).to contain_exactly([ "Grill One", include("admin") ], [ "Tea Two", [ "pos" ] ])
      expect(login(person.email, business_id: second.business_id)).to eq(403)
      expect(json[:error][:code]).to eq("app.denied")
      api_post "/api/v1/auth/login", { email: person.email, password: "password123", app: "pos" }
      expect(json[:business][:id]).to eq(second.business_id) # the till job is the one that opens the till
    end

    it "takes the business signed in to last when both open the admin, and switches to the other" do
      within(biz) { Membership.create!(user: person, role: role.("manager"), status: "active") }
      within(second.business) { Membership.create!(user: person, role: role.("accountant", second.business), status: "active") }
      login(person.email, business_id: biz.id)
      travel 1.minute
      login(person.email)
      expect(json[:business][:id]).to eq(biz.id)
      token = json[:access_token]
      travel 1.minute # travel freezes the clock: the switch's session must come after the login's
      api_post "/api/v1/auth/switch", { business_id: second.business_id }, headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(json[:business][:id]).to eq(second.business_id)
      travel 1.minute
      login(person.email)
      expect(json[:business][:id]).to eq(second.business_id)
    end

    it "says no when no membership opens the admin" do
      within(biz) { Membership.create!(user: person, role: role.("cashier"), status: "active") }
      expect(login(person.email)).to eq(403)
      expect(json[:error][:code]).to eq("app.denied")
    end

    it "never switches a till's PIN session into another business, nor into one where the app is closed" do
      cashier_here = within(biz) { Membership.create!(user: person, role: role.("manager"), status: "active") }
      within(second.business) { Membership.create!(user: person, role: role.("cashier", second.business), status: "active") }
      till = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
      api_post "/api/v1/auth/switch", { business_id: second.business_id }, headers: auth_headers(cashier_here, app: "pos", device: till)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("session.switch_denied")
      api_post "/api/v1/auth/switch", { business_id: second.business_id }, headers: auth_headers(cashier_here)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("app.denied")
    end
  end

  describe "P7: GET /staff" do
    it "gives contact details and sign-in times to staff.manage and to the member themself only" do
      rider = add_member!(biz, "rider")
      kitchen = add_member!(biz, "kitchen")
      get "/api/v1/staff", headers: auth_headers(rider, app: "rider")
      expect(response).to have_http_status(:ok)
      others = json[:data].reject { |m| m[:id] == rider.id }
      expect(others.map { |m| m[:user].keys }.uniq).to eq([ %i[id name] ])
      expect(others.flat_map(&:keys)).not_to include(:has_pin, :pin_locked, :invited_via)
      expect(json[:data].find { |m| m[:id] == owner.id }[:role][:name]).to eq("Owner")
      expect(json[:data].find { |m| m[:id] == rider.id }[:user]).to include(:email, :last_login_at)
      get "/api/v1/staff/#{owner.id}", headers: auth_headers(kitchen, app: "kitchen")
      expect(json[:user]).to eq(id: owner.user_id, name: owner.user.name)
      get "/api/v1/staff", headers: headers
      expect(json[:data].find { |m| m[:id] == rider.id }[:user]).to include(email: rider.user.email)
    end
  end

  describe "S4: presets give the access of the role they are named after" do
    let(:manager) { add_member!(biz, "manager") }

    it "keeps a manager able to open the admin after the Manager preset is saved" do
      api_put "/api/v1/staff/#{manager.id}/permissions", { preset: "manager" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:effective]).to include("app.admin", "staff.manage", "reports.view_all", "stock.actions", "MARKETING_CAMPAIGN")
      expect(json[:effective]).not_to include("payroll.manage", "PAYROLL", "settings.manage", "billing.manage")
      expect(json[:apps]).to include("admin", "pos")
      expect(login(manager.user.email)).to eq(200)
    end

    it "opens the till with the Cashier and Supervisor presets, the extra steps only with the Supervisor" do
      get "/api/v1/roles/presets", headers: headers
      presets = json[:data].to_h { |p| [ p[:key], Permission.expand(p[:codes]) ] }
      expect(presets["cashier"]).to include("app.pos", "orders.create", "payments.take", "shifts.own", "customers.manage", "SALES_WALKIN")
      expect(presets["cashier"]).not_to include("REOPEN_ORDER", "MARKETING_CAMPAIGN", "app.admin")
      expect(presets["supervisor"]).to include("app.pos", "payments.take", "REOPEN_ORDER", "orders.void", "MARKETING_CAMPAIGN")
      expect(presets["manager"]).to match_array(Permission.expand(RoleTemplate::TEMPLATES["manager"][:permissions]))
    end
  end

  describe "S5: one PIN, one active member" do
    let!(:bilal) { add_member!(biz, "cashier", pin: "4321") }

    it "refuses a new cashier with a PIN in use and creates nothing" do
      api_post "/api/v1/staff", { name: "Same Pin", phone: "+923005550101", role_id: role.("cashier").id, pin: "4321" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "pin.taken", message: include("already uses this PIN"))
      expect(User.exists?(phone: "+923005550101")).to be false
      api_post "/api/v1/staff", { name: "Own Pin", phone: "+923005550101", role_id: role.("cashier").id, pin: "4322" }, headers: headers
      expect(response).to have_http_status(:created)
    end

    it "refuses a PIN change to one in use, also against a PIN set before the lookup existed" do
      other = add_member!(biz, "waiter", pin: "1111")
      within(biz) { bilal.update_columns(pin_lookup: nil) } # set before 6 Nov 2026: only the bcrypt digest
      api_post "/api/v1/staff/#{other.id}/set_pin", { pin: "4321" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("pin.taken")
      api_post "/api/v1/staff/#{bilal.id}/set_pin", { pin: "4321" }, headers: headers # one's own PIN again is fine
      expect(response).to have_http_status(:ok)
    end

    it "lets a deactivated member's PIN go to someone else, then asks for a new one before reactivating them" do
      api_post "/api/v1/staff/#{bilal.id}/deactivate", {}, headers: headers
      api_post "/api/v1/staff", { name: "Sana", email: "sana.till@example.com", role_id: role.("cashier").id, pin: "4321" }, headers: headers
      expect(response).to have_http_status(:created)
      api_post "/api/v1/staff/#{bilal.id}/reactivate", {}, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("pin.taken")
      api_post "/api/v1/staff/#{bilal.id}/set_pin", { pin: "8765" }, headers: headers
      api_post "/api/v1/staff/#{bilal.id}/reactivate", {}, headers: headers
      expect(response).to have_http_status(:ok)
    end

    it "refuses a rider login with a PIN in use and leaves no rider behind" do
      api_post "/api/v1/riders", { name: "Rider Pin", phone: "+923005550102", create_login: true, pin: "4321" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(within(biz) { Rider.where(name: "Rider Pin").exists? }).to be false
    end
  end
end

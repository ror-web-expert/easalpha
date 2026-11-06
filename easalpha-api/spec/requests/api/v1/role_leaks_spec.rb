require "rails_helper"
require Rails.root.join("db/migrate/20261107100000_correct_role_permission_leaks")

# QA of 6 Nov 2026, P2: the default Manager held payroll through the SPEC code PAYROLL, and the default Cashier sent a
# campaign, because Permission.expand ticked every SPEC code a role's EasAlpha codes cover and customers.manage covers
# MARKETING_CAMPAIGN. A role never gains what docs/01-features.md section 10 keeps from it.
RSpec.describe "Roles never gain what they were meant to lack", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:role) { ->(key) { within(biz) { Role.find_by!(system_key: key) } } }
  let(:effective) { ->(m) { within(biz) { Membership.find(m.id).permission_codes } } }

  it "gives a new business's Manager no payroll, settings or billing, by any code" do
    manager = add_member!(biz, "manager")
    expect(effective.(manager)).not_to include("payroll.manage", "PAYROLL", "settings.manage", "billing.manage")
    expect(effective.(manager)).to include("staff.manage", "wages.pay", "MARKETING_CAMPAIGN", "reports.view_all")
    get "/api/v1/payroll/overview", headers: auth_headers(manager)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:message]).to include("payroll.manage")
  end

  it "keeps campaigns and voucher sending from the default Cashier, who still adds customers" do
    cashier = add_member!(biz, "cashier")
    expect(effective.(cashier)).not_to include("MARKETING_CAMPAIGN", "MARKETING_CONTACTS", "MARKETING")
    # What the till and the per-user editor rely on is still ticked: the codes that mean exactly what the role holds.
    expect(effective.(cashier)).to include("SALES_WALKIN", "PAYMENT", "CUSTOMER_ACCOUNT", "MY_TILL", "EXPENSES", "customers.manage")
    h = auth_headers(cashier, app: "pos")
    api_post "/api/v1/campaigns", { name: "Blast", body: "Hi {name}", segment: { kind: "all" }, send_now: true }, headers: h
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/campaigns", headers: h
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/voucher_batches", { name: "Eid", kind: "personal", value_kind: "fixed", value: 100 }, headers: auth_headers(owner)
    batch = json[:id]
    customer = within(biz) { Customer.create!(name: "Sara", phone: "+923001234111") }
    api_post "/api/v1/voucher_batches/#{batch}/issue", { customer_ids: [ customer.id ], send: true }, headers: h
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/customers", { name: "Walk-in regular", phone: "+923001234112" }, headers: h
    expect(response).to have_http_status(:created)
  end

  it "lets a member with the SPEC Supervisor preset, or the owner, run campaigns" do
    supervisor = add_member!(biz, "cashier")
    within(biz) { supervisor.set_permissions!(PermissionPreset.codes_for("supervisor")) }
    api_post "/api/v1/campaigns", { name: "Weekend", body: "Hi {name}", segment: { kind: "all" } }, headers: auth_headers(supervisor.reload)
    expect(response).to have_http_status(:created), response.body
    get "/api/v1/campaigns", headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
  end

  it "keeps the branch's sales on the dashboard from the Waiter and the Rider" do
    waiter = add_member!(biz, "waiter")
    rider = add_member!(biz, "rider")
    expect(effective.(waiter)).not_to include("DASHBOARD")
    expect(effective.(rider)).not_to include("VIEW_DAILY_SALES")
    get "/api/v1/reports/dashboard/all", headers: auth_headers(waiter, app: "pos")
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/reports/dashboard/all", headers: auth_headers(rider, app: "rider")
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/reports/dashboard/all", headers: auth_headers(add_member!(biz, "accountant"))
    expect(response).to have_http_status(:ok)
  end

  describe "the correction of existing data (CorrectRolePermissionLeaks)" do
    def migrate! = ActiveRecord::Migration.suppress_messages { CorrectRolePermissionLeaks.new.up }
    def codes(r) = within(biz) { RolePermission.where(role_id: r.id).pluck(:permission_code) }
    def grants(m) = within(biz) { UserPermission.where(membership_id: m.id).pluck(:permission_code) }
    def give!(r, *list) = within(biz) { list.each { |c| RolePermission.create!(role: r, permission_code: c) } }

    it "takes PAYROLL from Manager roles and their copies unless they hold payroll.manage, and from nothing else" do
      manager = role.("manager")
      give!(manager, "PAYROLL") # as the template made it before this fix
      copy = within(biz) { manager.copy!(name: "Shift lead") }
      deliberate = within(biz) { manager.copy!(name: "Payroll lead") }
      give!(deliberate, "payroll.manage")
      cashier_copy = within(biz) { role.("cashier").copy!(name: "Head cashier") }
      give!(cashier_copy, "PAYROLL")
      migrate!
      expect(codes(manager)).not_to include("PAYROLL")
      expect(codes(manager)).to include("staff.manage", "MARKETING")
      expect(codes(copy)).not_to include("PAYROLL")
      expect(codes(deliberate)).to include("PAYROLL", "payroll.manage")
      expect(codes(cashier_copy)).to include("PAYROLL")
    end

    it "takes the two campaign codes from custom sets the old editor saved for a cashier, never from a deliberate marketing grant" do
      cashier = add_member!(biz, "cashier")
      leaked = Permission.expand(RoleTemplate::TEMPLATES["cashier"][:permissions]) + %w[MARKETING_CAMPAIGN MARKETING_CONTACTS]
      within(biz) { cashier.set_permissions!(leaked.uniq - %w[expenses.manage EXPENSES]) } # the owner unticked expenses and saved
      supervisor = add_member!(biz, "cashier")
      within(biz) { supervisor.set_permissions!(PermissionPreset.codes_for("supervisor")) }
      manager_custom = add_member!(biz, "manager")
      within(biz) { manager_custom.set_permissions!(%w[MARKETING_CAMPAIGN SALES_WALKIN]) }
      migrate!
      expect(grants(cashier)).not_to include("MARKETING_CAMPAIGN", "MARKETING_CONTACTS")
      expect(grants(cashier)).to include("SALES_WALKIN", "customers.manage")
      expect(grants(supervisor)).to include("MARKETING_CAMPAIGN", "MARKETING_CONTACTS")
      expect(grants(manager_custom)).to include("MARKETING_CAMPAIGN") # its role holds SPEC codes: not the old rule's doing
    end
  end
end

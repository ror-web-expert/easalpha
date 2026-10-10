require "rails_helper"

RSpec.describe "Staff and roles", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }
  let(:cashier_role) { within(owner.business) { Role.find_by!(system_key: "cashier") } }

  it "adds a cashier with a PIN and limited branches" do
    api_post "/api/v1/staff", { name: "Haroon", phone: "03401234567", role_id: cashier_role.id, pin: "1234" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:role][:system_key]).to eq("cashier")
    expect(json[:has_pin]).to be true
    expect(json[:user][:phone]).to eq("+923401234567")
  end

  it "enforces the plan staff limit" do
    within(owner.business) { owner.business.update!(plan: Plan.find_by!(code: "starter")) }
    3.times { |i| api_post "/api/v1/staff", { name: "S#{i}", email: "s#{i}@x.com", role_id: cashier_role.id }, headers: headers }
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("plan.limit")
  end

  it "keeps the last owner" do
    api_post "/api/v1/staff/#{owner.id}/deactivate", {}, headers: headers
    expect(response).to have_http_status(:forbidden)
    api_patch "/api/v1/staff/#{owner.id}", { role_id: cashier_role.id }, headers: headers
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("staff.last_owner")
  end

  it "requires staff.manage to add staff" do
    cashier = within(owner.business) { Membership.create!(user: create(:user), role: cashier_role, status: "active") }
    api_post "/api/v1/staff", { name: "X", email: "x@x.com", role_id: cashier_role.id }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("permission.denied")
  end

  it "copies a role and changes its permissions, which members pick up at once" do
    api_post "/api/v1/roles", { name: "Senior Cashier", copy_from_role_id: cashier_role.id }, headers: headers
    expect(response).to have_http_status(:created)
    role_id = json[:id]
    perms = json[:permissions].map { |p| { code: p[:code], limit: p[:code] == "discounts.apply" ? 20 : p[:limit] } } + [{ code: "orders.void" }]
    api_put "/api/v1/roles/#{role_id}", { permissions: perms }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:permissions].find { |p| p[:code] == "discounts.apply" }[:limit].to_f).to eq(20.0)
    expect(json[:permissions].map { |p| p[:code] }).to include("orders.void")
  end

  it "rejects an unknown permission code and protects the owner role" do
    api_put "/api/v1/roles/#{cashier_role.id}", { permissions: [{ code: "orders.teleport" }] }, headers: headers
    expect(response).to have_http_status(:bad_request)
    owner_role = within(owner.business) { Role.find_by!(system_key: "owner") }
    api_put "/api/v1/roles/#{owner_role.id}", { permissions: [{ code: "menu.view" }] }, headers: headers
    expect(response).to have_http_status(:bad_request)
  end

  it "deactivation revokes refresh tokens" do
    cashier = within(owner.business) { Membership.create!(user: create(:user), role: cashier_role, status: "active") }
    raw = within(owner.business) { RefreshToken.issue!(user: cashier.user, membership: cashier, app: "pos") }
    api_post "/api/v1/staff/#{cashier.id}/deactivate", {}, headers: headers
    expect(response).to have_http_status(:ok)
    api_post "/api/v1/auth/refresh", { refresh_token: raw }
    expect(response).to have_http_status(:unauthorized)
  end

  it "writes audit rows for staff changes" do
    api_post "/api/v1/staff", { name: "H", email: "h@x.com", role_id: cashier_role.id }, headers: headers
    get "/api/v1/audit_logs", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:data].map { |a| a[:action] }).to include("create")
  end

  describe "isolation" do
    include_examples "tenant isolated", -> { "/api/v1/staff/#{owner.id}" }, methods: %i[get patch]
    include_examples "tenant isolated", -> { "/api/v1/roles/#{cashier_role.id}" }, methods: %i[get patch delete]
    include_examples "tenant isolated", -> { "/api/v1/branches/#{within(owner.business) { Branch.first.id }}" }
  end
end

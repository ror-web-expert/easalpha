require "rails_helper"

# QA of 6 Nov 2026, P3: "Open as support" minted a plain owner token; with it a support person put their own phone on
# the owner's account (an OTP to that phone plus PATCH /me) and then signed in as the owner by OTP, long after the hour.
# A support token is marked as support, ends with the session, changes no sign-in details, staff, devices or billing, and
# what it does is logged as the support person.
RSpec.describe "Support access tokens", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:admin) { create(:super_admin, name: "Hina from EasAlpha") }
  let(:super_headers) do
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    { "Authorization" => "Bearer #{json[:access_token]}" }
  end
  let(:session_id) do
    api_post "/api/v1/super/support_sessions", { business_id: biz.id, reason: "Printer setup" }, headers: super_headers
    sid = json[:id]
    api_post "/api/v1/support_sessions/#{sid}/approve", {}, headers: auth_headers(owner)
    sid
  end
  let(:support) do
    api_post "/api/v1/super/support_sessions/#{session_id}/token", {}, headers: super_headers
    expect(response).to have_http_status(:ok)
    { "Authorization" => "Bearer #{json[:access_token]}", "Content-Type" => "application/json" }
  end
  let(:claims) { JWT.decode(support["Authorization"].split.last, Rails.application.secret_key_base, true, algorithm: "HS256").first }

  it "is marked as support and lasts as long as the session, not a fixed owner session" do
    expires = within(biz) { SupportSession.find(session_id).expires_at }
    expect(claims).to include("sup" => session_id, "sa" => admin.id, "mid" => owner.id)
    expect(claims["exp"]).to be_within(2).of(expires.to_i)
    get "/api/v1/me", headers: support
    expect(json[:support]).to include(session_id: session_id, reason: "Printer setup", by: { name: "Hina from EasAlpha", email: admin.email })
    get "/api/v1/me", headers: auth_headers(owner)
    expect(json[:support]).to be_nil
  end

  it "stops working the moment the owner ends the session, or its hour is up" do
    get "/api/v1/customers", headers: support
    expect(response).to have_http_status(:ok)
    api_post "/api/v1/support_sessions/#{session_id}/end", {}, headers: auth_headers(owner)
    expect(json).to include(status: "ended", active: false)
    get "/api/v1/customers", headers: support
    expect(response).to have_http_status(:unauthorized)
    expect(json[:error][:code]).to eq("support.ended")

    other = nil
    travel_to(2.hours.ago) do
      api_post "/api/v1/super/support_sessions", { business_id: biz.id, reason: "Later" }, headers: super_headers
      other = json[:id]
      api_post "/api/v1/support_sessions/#{other}/approve", {}, headers: auth_headers(owner)
    end
    within(biz) { SupportSession.find(other).update_columns(expires_at: 1.minute.from_now) }
    api_post "/api/v1/super/support_sessions/#{other}/token", {}, headers: super_headers
    late = { "Authorization" => "Bearer #{json[:access_token]}" }
    travel 2.minutes
    get "/api/v1/customers", headers: late
    expect(response).to have_http_status(:unauthorized)
  end

  it "refuses the profile, staff, roles, PINs, devices, billing, approvals and switching, and no OTP login follows" do
    cashier = add_member!(biz, "cashier", pin: "1357")
    api_post "/api/v1/auth/otp/request", { phone: "+923451112233", purpose: "verify_phone" }
    api_patch "/api/v1/me", { phone: "+923451112233", otp_code: json[:dev_code] }, headers: support
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("support.denied")
    expect(owner.user.reload.phone).to be_nil
    api_post "/api/v1/auth/otp/request", { phone: "+923451112233", purpose: "login" }
    api_post "/api/v1/auth/otp/verify", { phone: "+923451112233", code: json[:dev_code], app: "admin" }
    expect(json).not_to have_key(:access_token)

    manager_role = within(biz) { Role.find_by!(system_key: "manager") }
    attempts = [
      [ :post, "/api/v1/staff", { name: "Back door", email: "door@example.com", password: "password123", role_id: manager_role.id } ],
      [ :patch, "/api/v1/staff/#{cashier.id}", { role_id: manager_role.id } ],
      [ :post, "/api/v1/staff/#{cashier.id}/set_pin", { pin: "2468" } ],
      [ :put, "/api/v1/staff/#{cashier.id}/permissions", { preset: "manager" } ],
      [ :post, "/api/v1/staff/#{cashier.id}/deactivate", {} ],
      [ :put, "/api/v1/roles/#{manager_role.id}", { permissions: [ { code: "app.admin" } ] } ],
      [ :post, "/api/v1/devices", { name: "Support till", kind: "till" } ],
      [ :post, "/api/v1/support_sessions/#{session_id}/approve", {} ],
      [ :post, "/api/v1/auth/switch", { business_id: biz.id } ],
      [ :post, "/api/v1/riders", { name: "Rider", phone: "+923451112244", create_login: true } ],
      [ :patch, "/api/v1/integrations/foodpanda", { secret: "rotate" } ],
      [ :patch, "/api/v1/settings", { values: { "tax.pra.bearer_token" => "theirs" } } ],
      [ :post, "/api/v1/whatsapp/connection/start", {} ]
    ]
    attempts.each do |verb, path, body|
      send(verb, path, params: body.to_json, headers: support)
      expect([ path, response.status ]).to eq([ path, 403 ])
    end
    expect(within(biz) { [ Membership.count, Device.count, cashier.reload.role.system_key ] }).to eq([ 2, 0, "cashier" ])
  end

  it "logs what it does as the support person, not as the owner" do
    api_post "/api/v1/customers", { name: "Added by support", phone: "+923451112255" }, headers: support
    expect(response).to have_http_status(:created)
    row = AuditLog.where(business_id: biz.id, table_name: "customers").order(:occurred_at).last
    expect(row).to have_attributes(user_id: nil, super_admin_id: admin.id)
    get "/api/v1/audit_logs?table_name=customers", headers: auth_headers(owner)
    expect(json[:data].first).to include(user_name: "EasAlpha support (Hina from EasAlpha)", super_admin_id: admin.id)
    api_post "/api/v1/customers", { name: "Added by the owner", phone: "+923451112256" }, headers: auth_headers(owner)
    expect(AuditLog.where(business_id: biz.id, table_name: "customers").order(:occurred_at).last).to have_attributes(user_id: owner.user_id, super_admin_id: nil)
  end

  # L2, 7 Nov 2026: the insights grouped by user alone, so support's rows (no user) were counted as "System".
  it "names the support person in the audit insights, apart from what nobody signed in did" do
    2.times { |i| api_post "/api/v1/customers", { name: "Added by support #{i}", phone: "+92345111226#{i}" }, headers: support }
    expect(response).to have_http_status(:created)
    within(biz) { AuditLog.record(action: "export", table_name: "orders", business: biz, actor: { user_id: nil, super_admin_id: nil }) } # a job's row
    get "/api/v1/audit_logs/insights?table_name=customers", headers: auth_headers(owner)
    expect(json[:by_actor].first).to eq(user_id: nil, super_admin_id: admin.id, name: "EasAlpha support (Hina from EasAlpha)", count: 2)
    expect(json[:by_actor].pluck(:name)).not_to include("System")
    get "/api/v1/audit_logs/insights", headers: auth_headers(owner)
    actors = json[:by_actor].index_by { |a| a[:name] }
    expect(actors["EasAlpha support (Hina from EasAlpha)"]).to include(super_admin_id: admin.id)
    expect(actors["System"]).to include(user_id: nil, super_admin_id: nil)
    expect(actors["System"][:count]).to eq(AuditLog.where(business_id: biz.id, user_id: nil, super_admin_id: nil).count)
  end
end

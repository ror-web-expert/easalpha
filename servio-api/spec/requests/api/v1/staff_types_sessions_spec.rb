require "rails_helper"

# SPEC: separate staff populations, a User Sessions screen, and a business day that runs as a window (6:01 am to 2:01 am).
RSpec.describe "Staff types, user sessions and the business day", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }
  let(:cashier_role) { within(owner.business) { Role.find_by!(system_key: "cashier") } }
  let(:waiter_role) { within(owner.business) { Role.find_by!(system_key: "waiter") } }

  describe "staff types" do
    it "derives the type from the role and filters the list by it" do
      api_post "/api/v1/staff", { name: "Haroon", email: "h@x.com", role_id: cashier_role.id }, headers: headers
      expect(json[:staff_type]).to eq("cashier")
      expect(json[:cashier_role]).to eq("cashier")
      api_post "/api/v1/staff", { name: "Wasim", email: "w@x.com", role_id: waiter_role.id }, headers: headers
      expect(json[:staff_type]).to eq("order_taker")
      get "/api/v1/staff?staff_type=cashier", headers: headers
      expect(json[:data].map { |m| m[:user][:name] }).to eq(["Haroon"])
      get "/api/v1/staff?staff_type=admin", headers: headers
      expect(json[:data].map { |m| m[:user][:name] }).to eq([owner.user.name])
    end

    it "lets a cashier be a Supervisor or Kitchen Display, and refuses an unknown type" do
      api_post "/api/v1/staff", { name: "K", email: "k@x.com", role_id: cashier_role.id, cashier_role: "kitchen_display" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:cashier_role]).to eq("kitchen_display")
      api_patch "/api/v1/staff/#{json[:id]}", { cashier_role: "supervisor" }, headers: headers
      expect(json[:cashier_role]).to eq("supervisor")
      api_post "/api/v1/staff", { name: "Z", email: "z@x.com", role_id: cashier_role.id, staff_type: "alien" }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "user sessions" do
    let(:cashier) { within(owner.business) { Membership.create!(user: create(:user), role: cashier_role, status: "active") } }

    it "lists sign-ins with app, device and times, and a revoke signs the session out" do
      raw = within(owner.business) { RefreshToken.issue!(user: cashier.user, membership: cashier, app: "pos", user_agent: "Till/1.0", ip: "10.0.0.5") }
      get "/api/v1/staff/sessions", headers: headers
      expect(response).to have_http_status(:ok)
      row = json[:data].find { |s| s[:membership_id] == cashier.id }
      expect(row).to include(app: "pos", ip: "10.0.0.5", user_agent: "Till/1.0", active: true, staff_type: "cashier")
      expect(row[:signed_out_at]).to be_nil
      api_post "/api/v1/staff/sessions/#{row[:id]}/revoke", {}, headers: headers
      expect(json[:active]).to be false
      api_post "/api/v1/auth/refresh", { refresh_token: raw }
      expect(response).to have_http_status(:unauthorized)
    end

    it "is denied without staff.manage" do
      get "/api/v1/staff/sessions", headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end

    it "hides another business's sessions" do
      other = signup_business(name: "Other")
      rt = within(other.business) { RefreshToken.create!(user: other.user, membership: other, app: "admin", token_digest: "x", expires_at: 1.day.from_now) }
      api_post "/api/v1/staff/sessions/#{rt.id}/revoke", {}, headers: headers
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "business day window" do
    it "defaults to 06:01 to 02:01 and puts 1:30 am on the previous day" do
      branch = within(owner.business) { Branch.first }
      expect(branch.business_day_start.strftime("%H:%M")).to eq("06:01")
      expect(branch.day_end_time.strftime("%H:%M")).to eq("02:01")
      t = Time.find_zone("Asia/Karachi").local(2026, 10, 11, 1, 30)
      expect(branch.business_day_for(t)).to eq(Date.new(2026, 10, 10))
      expect(branch.business_day_for(t + 1.hour)).to eq(Date.new(2026, 10, 11))
      get "/api/v1/branches/#{branch.id}", headers: headers
      expect(json[:business_day_window]).to eq("06:01 to 02:01")
    end

    it "can be changed from the Business Hours settings and needs settings.manage" do
      branch = within(owner.business) { Branch.first }
      api_patch "/api/v1/branches/#{branch.id}", { business_day_start: "07:00", day_end_time: "03:00" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:business_day_window]).to eq("07:00 to 03:00")
      cashier = within(owner.business) { Membership.create!(user: create(:user), role: cashier_role, status: "active") }
      api_patch "/api/v1/branches/#{branch.id}", { business_day_start: "08:00" }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "change password" do
    it "rejects a wrong current password and accepts the right one" do
      api_patch "/api/v1/me", { current_password: "nope", password: "newpassword1" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("password.current_wrong")
      api_patch "/api/v1/me", { current_password: "password123", password: "newpassword1" }, headers: headers
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/auth/login", { email: owner.user.email, password: "newpassword1" }
      expect(response).to have_http_status(:ok)
    end
  end
end

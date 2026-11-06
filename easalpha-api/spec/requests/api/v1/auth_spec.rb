require "rails_helper"

RSpec.describe "Auth", type: :request do
  describe "POST /api/v1/auth/signup" do
    it "creates a business on the 40-day Business trial with an owner, main branch and seven roles" do
      api_post "/api/v1/auth/signup", { name: "Ali", business_name: "Karachi Grill", email: "ali@example.com", password: "password123" }
      expect(response).to have_http_status(:created)
      expect(json[:access_token]).to be_present
      expect(json[:refresh_token]).to be_present
      expect(json[:business][:slug]).to eq("karachi-grill")
      expect(json[:business][:status]).to eq("trial")
      expect(json[:business][:trial_days_left]).to be_between(39, 40)
      expect(json[:business][:plan][:code]).to eq("business") # the trial opens every feature
      expect(json[:membership][:role][:system_key]).to eq("owner")
      expect(json[:permissions]).to include("orders.void", "staff.manage", "billing.manage")
      business = Business.find(json[:business][:id])
      within(business) do
        expect(Role.count).to eq(7)
        expect(Branch.count).to eq(1)
        expect(Branch.first.is_main).to be true
        expect(SetupChecklistItem.count).to eq(10)
      end
    end

    it "rejects a duplicate email" do
      signup_business(email: "dup@example.com")
      api_post "/api/v1/auth/signup", { name: "B", business_name: "B Cafe", email: "dup@example.com", password: "password123" }
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("signup.exists")
    end

    it "signs up by phone with an OTP" do
      api_post "/api/v1/auth/otp/request", { phone: "03001234567", purpose: "signup" }
      expect(response).to have_http_status(:ok)
      expect(json[:phone]).to eq("+923001234567")
      code = json[:dev_code]
      api_post "/api/v1/auth/signup", { name: "Sara", business_name: "Tea Spot", phone: "03001234567", otp_code: code }
      expect(response).to have_http_status(:created)
      expect(json[:user][:phone]).to eq("+923001234567")
    end

    it "makes slugs unique" do
      signup_business(name: "Karachi Grill")
      signup_business(name: "Karachi Grill")
      expect(Business.where("slug LIKE 'karachi-grill%'").pluck(:slug).sort).to eq(%w[karachi-grill karachi-grill-2])
    end
  end

  describe "POST /api/v1/auth/login" do
    let!(:owner) { signup_business(email: "login@example.com") }

    it "logs in with email and password and returns the business context" do
      api_post "/api/v1/auth/login", { email: "login@example.com", password: "password123" }
      expect(response).to have_http_status(:ok)
      expect(json[:business][:id]).to eq(owner.business_id)
      expect(json[:businesses].size).to eq(1)
    end

    it "rejects a wrong password" do
      api_post "/api/v1/auth/login", { email: "login@example.com", password: "wrong" }
      expect(response).to have_http_status(:unauthorized)
      expect(json[:error][:code]).to eq("login.invalid")
    end

    it "refreshes and rotates the refresh token, then rejects the old one once the replay window has passed" do
      api_post "/api/v1/auth/login", { email: "login@example.com", password: "password123" }
      old = json[:refresh_token]
      api_post "/api/v1/auth/refresh", { refresh_token: old }
      expect(response).to have_http_status(:ok)
      expect(json[:refresh_token]).not_to eq(old)
      travel 31.seconds
      api_post "/api/v1/auth/refresh", { refresh_token: old }
      expect(response).to have_http_status(:unauthorized)
    end

    it "logs in by phone OTP" do
      # A proven phone: one never proven on an email login asks that login's password once (staff_invitations_spec).
      owner.user.update!(phone: "+923009999999", phone_verified_at: Time.current)
      api_post "/api/v1/auth/otp/request", { phone: "+923009999999" }
      code = json[:dev_code]
      api_post "/api/v1/auth/otp/verify", { phone: "+923009999999", code: code }
      expect(response).to have_http_status(:ok)
      expect(json[:access_token]).to be_present
    end

    it "denies an app the role cannot open" do
      api_post "/api/v1/auth/login", { email: "login@example.com", password: "password123", app: "rider" }
      expect(response).to have_http_status(:ok) # owner has every app
      Tenancy::Context.with(owner.business) { owner.update!(role: Role.find_by!(system_key: "waiter")) }
      api_post "/api/v1/auth/login", { email: "login@example.com", password: "password123", app: "admin" }
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("app.denied")
    end
  end

  # Review R28: two tabs of one till share the session. Both refresh when the access token runs out; the second one
  # presents the token the first has just spent and used to get a 401, which signed that tab out.
  describe "POST /api/v1/auth/refresh replay window" do
    let!(:owner) { signup_business(email: "tabs@example.com") }
    let(:spent) do
      api_post "/api/v1/auth/login", { email: "tabs@example.com", password: "password123" }
      json[:refresh_token]
    end

    def refresh(token)
      api_post "/api/v1/auth/refresh", { refresh_token: token }
      response.status == 200 ? json : nil
    end

    it "answers the spent token within 30 seconds with the same new refresh token, issuing nothing more" do
      first = refresh(spent)
      expect(first[:refresh_token]).to be_present
      expect { travel(29.seconds) { expect(refresh(spent)).to include(refresh_token: first[:refresh_token], access_token: be_present) } }.not_to change(RefreshToken, :count)
      expect(JWT.decode(json[:access_token], Rails.application.secret_key_base, true, algorithm: "HS256").first).to include("mid" => owner.id, "app" => "admin")
      expect(refresh(first[:refresh_token])[:refresh_token]).not_to eq(first[:refresh_token]) # the successor rotates as usual
    end

    it "refuses the spent token after 30 seconds" do
      refresh(spent)
      travel 31.seconds
      expect(refresh(spent)).to be_nil
      expect(json[:error][:code]).to eq("refresh.invalid")
    end

    it "refuses it once the successor is spent" do
      successor = refresh(spent)[:refresh_token]
      refresh(successor)
      expect(refresh(spent)).to be_nil
    end

    it "refuses it once the successor is signed out" do
      successor = refresh(spent)[:refresh_token]
      api_post "/api/v1/auth/logout", { refresh_token: successor }
      expect(refresh(spent)).to be_nil
    end

    it "never revives a token signed out with logout" do
      token = spent
      api_post "/api/v1/auth/logout", { refresh_token: token }
      expect(refresh(token)).to be_nil
    end

    it "refuses a replay for a member deactivated in the meantime" do
      staff = within(owner.business) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active") }
      raw = within(owner.business) { RefreshToken.issue!(user: staff.user, membership: staff, app: "pos") }
      expect(refresh(raw)).to be_present
      within(owner.business) { staff.deactivate! }
      expect(refresh(raw)).to be_nil
    end

    it "keeps a refused refresh from spending the token" do
      staff = within(owner.business) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active") }
      raw = within(owner.business) { RefreshToken.issue!(user: staff.user, membership: staff, app: "pos") }
      within(owner.business) { staff.update_columns(status: "invited") } # not active, tokens left alone
      expect(refresh(raw)).to be_nil
      expect(json[:error][:code]).to eq("session.invalid")
      expect(RefreshToken.find_by(token_digest: RefreshToken.digest(raw)).revoked_at).to be_nil
    end
  end

  describe "switching business" do
    it "issues a token for another business the user belongs to" do
      owner = signup_business(email: "multi@example.com")
      other = signup_business(name: "Second Place")
      Tenancy::Context.with(other.business) do
        Membership.create!(user: owner.user, role: Role.find_by!(system_key: "manager"), status: "active")
      end
      api_post "/api/v1/auth/switch", { business_id: other.business_id }, headers: auth_headers(owner)
      expect(response).to have_http_status(:ok)
      expect(json[:business][:id]).to eq(other.business_id)
      expect(json[:membership][:role][:system_key]).to eq("manager")
    end
  end

  describe "GET /api/v1/me" do
    it "returns the user, business, branches, permissions and checklist" do
      owner = signup_business
      get "/api/v1/me", headers: auth_headers(owner)
      expect(response).to have_http_status(:ok)
      expect(json[:branches].size).to eq(1)
      expect(json[:checklist].size).to eq(10)
      expect(json[:permissions]).to include("app.admin")
    end

    it "rejects an expired token" do
      owner = signup_business
      token = JWT.encode({ typ: "access", sub: owner.user_id, mid: owner.id, bid: owner.business_id, exp: 1.minute.ago.to_i }, Rails.application.secret_key_base, "HS256")
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects a deactivated member" do
      owner = signup_business
      staff = nil
      within(owner.business) do
        staff = Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active")
        staff.deactivate!
      end
      get "/api/v1/me", headers: auth_headers(staff)
      expect(response).to have_http_status(:unauthorized)
    end
  end
end

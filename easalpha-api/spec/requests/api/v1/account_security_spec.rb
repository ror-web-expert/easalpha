require "rails_helper"

# Review of 6 Nov 2026: R8 (an owner adding staff never sets or changes an existing account's password or name; a new
# email or phone on /me needs the current password or, for a phone, a code sent to it), R10 (a support session opens
# only for the super admin it was approved for) and R13 (an OTP request answers the same with or without an account).
RSpec.describe "Accounts: linking staff, contact changes, support sessions, OTP requests", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:cashier_role) { within(biz) { Role.find_by!(system_key: "cashier") } }

  # The cashier login opens the POS (the newest membership is the one a login picks); 401 is a wrong password.
  def login(email, password)
    api_post "/api/v1/auth/login", { email: email, password: password, app: "pos" }
    response.status
  end

  describe "R8: adding staff" do
    # Sana signed up for her own cafe first; she also works at this one.
    let!(:sana) { signup_business(name: "Sana Cafe", email: "sana@example.com", password: "sanas-own-pass") }

    it "links an existing account by email or phone as it is: its name and password stay, the owner's password is not used" do
      api_post "/api/v1/staff", { name: "Someone Else", email: "SANA@example.com", password: "owner-chosen-1", role_id: cashier_role.id }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(linked_existing_user: true)
      expect(json[:user]).to include(id: sana.user_id, name: sana.user.name)
      expect(login("sana@example.com", "owner-chosen-1")).to eq(401)
      expect(login("sana@example.com", "sanas-own-pass")).to eq(200)

      phone_user = create(:user, email: nil, phone: "+923005550001", password: nil, name: "Bilal Rider")
      api_post "/api/v1/staff", { name: "Not Bilal", phone: "03005550001", password: "owner-chosen-2", role_id: cashier_role.id }, headers: headers
      expect(json).to include(linked_existing_user: true)
      expect(phone_user.reload).to have_attributes(name: "Bilal Rider", password_digest: nil)
    end

    it "gives a brand-new login the name and password the owner typed" do
      api_post "/api/v1/staff", { name: "Ali Raza", email: "ali.new@example.com", password: "owner-chosen-1", role_id: cashier_role.id }, headers: headers
      expect(json).to include(linked_existing_user: false)
      expect(json[:user][:name]).to eq("Ali Raza")
      expect(login("ali.new@example.com", "owner-chosen-1")).to eq(200)
    end

    it "renames only a login this business made, never a linked account or one that works elsewhere too" do
      api_post "/api/v1/staff", { email: "sana@example.com", role_id: cashier_role.id }, headers: headers
      linked = json[:id]
      api_patch "/api/v1/staff/#{linked}", { name: "Renamed", role_id: cashier_role.id }, headers: headers
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("staff.linked_user")
      expect(sana.user.reload.name).not_to eq("Renamed")
      expect(within(biz) { Membership.find(linked).role_id }).to eq(cashier_role.id) # nothing else was saved either

      api_post "/api/v1/staff", { name: "Ali Raza", email: "ali.new@example.com", password: "owner-chosen-1", role_id: cashier_role.id }, headers: headers
      ali = json
      api_patch "/api/v1/staff/#{ali[:id]}", { name: "Ali Raza Khan" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:user][:name]).to eq("Ali Raza Khan")

      # Ali takes a second job; from then on his name is his own here too.
      api_post "/api/v1/staff", { email: "ali.new@example.com", role_id: within(sana.business) { Role.find_by!(system_key: "cashier").id } }, headers: auth_headers(sana)
      expect(json).to include(linked_existing_user: true)
      api_patch "/api/v1/staff/#{ali[:id]}", { name: "Ali R." }, headers: headers
      expect(json[:error][:code]).to eq("staff.linked_user")
    end
  end

  describe "R8: changing the email or phone on /me" do
    it "needs the current password; a wrong or missing one saves nothing" do
      api_patch "/api/v1/me", { name: "New Name", email: "taken-over@example.com" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("contact.verification_required")
      api_patch "/api/v1/me", { name: "New Name", email: "taken-over@example.com", current_password: "wrong" }, headers: headers
      expect(json[:error][:code]).to eq("password.current_wrong")
      api_patch "/api/v1/me", { name: "New Name", phone: "+923001112223" }, headers: headers
      expect(json[:error][:code]).to eq("contact.verification_required")
      expect(owner.user.reload).to have_attributes(name: owner.user.name, phone: nil)
      expect(owner.user.email).not_to eq("taken-over@example.com")

      api_patch "/api/v1/me", { email: "owner.moved@example.com", current_password: "password123" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:email]).to eq("owner.moved@example.com")
    end

    it "takes a new phone with the code sent to that phone instead of the password" do
      api_post "/api/v1/auth/otp/request", { phone: "+923001112224", purpose: "login" }
      login_code = json[:dev_code]
      api_patch "/api/v1/me", { phone: "+923001112224", otp_code: login_code }, headers: headers
      expect(json[:error][:code]).to eq("contact.verification_required") # a login code is not a phone confirmation

      api_post "/api/v1/auth/otp/request", { phone: "+923001112225", purpose: "verify_phone" }
      other_phone_code = json[:dev_code]
      api_patch "/api/v1/me", { phone: "+923001112224", otp_code: other_phone_code }, headers: headers
      expect(json[:error][:code]).to eq("contact.verification_required") # a code for another number

      api_post "/api/v1/auth/otp/request", { phone: "+923001112224", purpose: "verify_phone" }
      api_patch "/api/v1/me", { phone: "03001112224", otp_code: json[:dev_code] }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(owner.user.reload.phone).to eq("+923001112224")
      api_patch "/api/v1/me", { email: "else@example.com", otp_code: "123456" }, headers: headers
      expect(json[:error][:code]).to eq("contact.verification_required") # an email always takes the password
    end

    it "changes the name or language with nothing more, and the same email or phone counts as no change" do
      api_patch "/api/v1/me", { name: "Owner Renamed", locale: "ur", email: owner.user.email.upcase }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(owner.user.reload).to have_attributes(name: "Owner Renamed", locale: "ur")
    end

    it "saves nothing else from a password change with the wrong current password" do
      api_patch "/api/v1/me", { name: "Should Not Stick", current_password: "nope", password: "newpassword1" }, headers: headers
      expect(json[:error][:code]).to eq("password.current_wrong")
      expect(owner.user.reload.name).not_to eq("Should Not Stick")
    end
  end

  describe "R10: support sessions" do
    def super_headers(admin)
      api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
      { "Authorization" => "Bearer #{json[:access_token]}" }
    end

    it "opens only for the super admin who asked and was approved" do
      asker = create(:super_admin)
      colleague = create(:super_admin)
      mine = super_headers(asker)
      theirs = super_headers(colleague)
      api_post "/api/v1/super/support_sessions", { business_id: biz.id, reason: "Printer ticket 42" }, headers: mine
      sid = json[:id]
      api_post "/api/v1/support_sessions/#{sid}/approve", {}, headers: headers
      api_post "/api/v1/super/support_sessions/#{sid}/token", {}, headers: theirs
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("support.not_yours")
      expect(json).not_to have_key(:access_token)
      api_post "/api/v1/super/support_sessions/#{sid}/token", {}, headers: mine
      expect(response).to have_http_status(:ok)
      expect(json[:access_token]).to be_present
    end
  end

  describe "R13: OTP requests" do
    it "answers the same for a phone with an account and one without, and sends a code only to the first" do
      owner.user.update!(phone: "+923007770001")
      api_post "/api/v1/auth/otp/request", { phone: "+923007770001", purpose: "login" }
      with_account = [ response.status, json.except(:phone, :dev_code).merge(dev_code: json[:dev_code].present?) ]
      api_post "/api/v1/auth/otp/request", { phone: "+923007770002", purpose: "login" }
      without = [ response.status, json.except(:phone, :dev_code).merge(dev_code: json[:dev_code].present?) ]
      expect(without).to eq(with_account)
      expect(with_account.first).to eq(200)
      expect(WhatsappMessage.where(to_phone: "+923007770001", template_name: "login_otp").count).to eq(1)
      expect(WhatsappMessage.where(to_phone: "+923007770002").count).to eq(0)
      api_post "/api/v1/auth/otp/verify", { phone: "+923007770002", code: json[:dev_code] }
      expect(json).not_to have_key(:access_token)
    end
  end
end

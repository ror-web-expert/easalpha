require "rails_helper"
require Rails.root.join("db/migrate/20261107100200_verified_identities_and_staff_invitations")

# QA of 6 Nov 2026, P1: a stranger signed up with their own email and a cashier's phone (or with someone's email), the
# owner added that person as staff, the stranger's account was linked and read the business's customers, sales and P&L.
# A phone or email links an account only once the account proved it; otherwise the business gets an invitation that the
# real person accepts by proving the phone or email.
RSpec.describe "Proven phones and emails, and staff invitations", type: :request do
  let!(:owner) { signup_business(name: "Victim Grill") }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:role) { ->(key) { within(biz) { Role.find_by!(system_key: key) } } }
  let(:cashier_phone) { "+923331234567" }

  def signup_stranger(email: "stranger@example.com", phone: nil)
    api_post "/api/v1/auth/signup", { name: "Stranger", business_name: "Stranger Cafe", email: email, password: "stranger-pass", phone: phone }.compact
    expect(response).to have_http_status(:created)
    User.find(json[:user][:id])
  end

  def otp(phone, purpose)
    api_post "/api/v1/auth/otp/request", { phone: phone, purpose: purpose }
    json[:dev_code]
  end

  describe "the two ways the tester got in" do
    it "keeps a stranger who signed up with the cashier's phone out: the owner's add becomes an invitation" do
      stranger = signup_stranger(phone: cashier_phone)
      expect(stranger).to have_attributes(phone: cashier_phone, phone_verified_at: nil)
      api_post "/api/v1/staff", { name: "Ali", phone: cashier_phone, role_id: role.("cashier").id, pin: "5199" }, headers: headers
      expect(response).to have_http_status(:accepted)
      expect(json).to include(invited: true)
      expect(json[:invitation]).to include(name: "Ali", phone: cashier_phone, has_pin: true, status: "pending")
      expect(within(biz) { Membership.exists?(user_id: stranger.id) }).to be false

      api_post "/api/v1/auth/login", { email: "stranger@example.com", password: "stranger-pass", app: "admin" }
      expect(json[:businesses].map { |b| b[:name] }).to eq([ "Stranger Cafe" ])
      api_post "/api/v1/auth/switch", { business_id: biz.id }, headers: { "Authorization" => "Bearer #{json[:access_token]}" }
      expect(response).to have_http_status(:not_found)
    end

    it "keeps a stranger who signed up with someone's email out, whatever password the owner types" do
      stranger = signup_stranger(email: "real.accountant@example.com")
      api_post "/api/v1/staff", { name: "Real Accountant", email: "real.accountant@example.com", password: "owner-chosen-pw", role_id: role.("accountant").id, staff_type: "admin" }, headers: headers
      expect(response).to have_http_status(:accepted)
      expect(within(biz) { Membership.exists?(user_id: stranger.id) }).to be false
      expect(stranger.reload.authenticate("owner-chosen-pw")).to be false
    end
  end

  describe "what still links at once" do
    it "links a login that proved the phone, and one whose only way in is the phone (a till cashier added elsewhere)" do
      proven = create(:user, email: nil, password: nil, phone: "+923331230001", phone_verified_at: 1.day.ago)
      phone_only = create(:user, email: nil, password: nil, phone: "+923331230002")
      [ proven, phone_only ].each do |u|
        api_post "/api/v1/staff", { name: "Someone", phone: u.phone, role_id: role.("cashier").id }, headers: headers
        expect(response).to have_http_status(:created)
        expect(json).to include(linked_existing_user: true)
        expect(json[:user][:id]).to eq(u.id)
      end
    end

    it "invites when the phone and the email belong to two different logins" do
      create(:user, email: nil, password: nil, phone: "+923331230003", phone_verified_at: 1.day.ago)
      create(:user, email: "other.person@example.com", email_verified_at: 1.day.ago)
      api_post "/api/v1/staff", { name: "Mixed", phone: "+923331230003", email: "other.person@example.com", role_id: role.("cashier").id }, headers: headers
      expect(response).to have_http_status(:accepted)
    end

    it "makes a new login as before when nobody has the phone or email" do
      api_post "/api/v1/staff", { name: "New Person", phone: "+923331230004", role_id: role.("cashier").id }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(linked_existing_user: false)
    end
  end

  describe "the real person joins" do
    before do
      signup_stranger(phone: cashier_phone)
      api_post "/api/v1/staff", { name: "Ali", phone: cashier_phone, role_id: role.("manager").id, pin: "5199", staff_type: "admin" }, headers: headers
    end

    it "by signing in with a code to the phone: a new login, the stranger's account letting the number go" do
      code = otp(cashier_phone, "login")
      api_post "/api/v1/auth/otp/verify", { phone: cashier_phone, code: code, app: "admin" }
      expect(response).to have_http_status(:forbidden)
      expect(json[:error]).to include(code: "phone.password_required", details: { invitations: [ "Victim Grill" ] })
      api_post "/api/v1/auth/otp/verify", { phone: cashier_phone, code: code, app: "admin", new_login: true }
      expect(response).to have_http_status(:ok), response.body
      expect(json[:business][:id]).to eq(biz.id)
      expect(json[:user]).to include(name: "Ali", phone: cashier_phone)
      ali = User.find(json[:user][:id])
      expect(ali.verified?(:phone)).to be true
      expect(User.find_by(email: "stranger@example.com").phone).to be_nil
      member = within(biz) { Membership.find_by!(user_id: ali.id) }
      expect(member).to have_attributes(staff_type: "admin", status: "active")
      expect(member.pin_digest).to be_present
      expect(within(biz) { StaffInvitation.last.status }).to eq("accepted")
    end

    it "on the link: the code to the phone, then a new login" do
      token = within(biz) { StaffInvitation.last.token }
      get "/api/v1/invitations/#{token}"
      expect(json).to include(role: "Manager", proof: "phone", to: "+92******4567", status: "pending")
      expect(json[:business][:name]).to eq("Victim Grill")
      api_post "/api/v1/invitations/#{token}/code", {}
      code = json[:dev_code]
      api_post "/api/v1/invitations/#{token}/accept", { code: "000000" }
      expect(response).to have_http_status(:unauthorized)
      api_post "/api/v1/invitations/#{token}/accept", { code: code }
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("invitation.sign_in")
      api_post "/api/v1/invitations/#{token}/accept", { code: code, new_login: true }
      expect(response).to have_http_status(:created), response.body
      expect(json).to include(joined: true, access_token: be_present)
      expect(json[:membership][:role][:system_key]).to eq("manager")
      api_post "/api/v1/invitations/#{token}/accept", { code: code, new_login: true }
      expect(json[:error][:code]).to eq("invitation.closed")
      get "/api/v1/invitations/#{token}x"
      expect(response).to have_http_status(:not_found)
    end
  end

  it "lets someone join with their own login by its password when they had not confirmed the email" do
    sana = signup_business(name: "Sana Cafe", email: "sana@example.com", password: "sanas-own-pass")
    api_post "/api/v1/staff", { name: "Sana", email: "sana@example.com", role_id: role.("accountant").id, staff_type: "admin" }, headers: headers
    token = within(biz) { StaffInvitation.find(json[:invitation][:id]).token }
    expect(ActionMailer::Base.deliveries.size + enqueued_jobs.size).to be > 0
    api_post "/api/v1/invitations/#{token}/code", {}
    code = json[:dev_code]
    api_post "/api/v1/invitations/#{token}/accept", { code: code, password: "wrong" }
    expect(json[:error][:code]).to eq("login.invalid")
    api_post "/api/v1/invitations/#{token}/accept", { code: code, password: "sanas-own-pass" }
    expect(response).to have_http_status(:created)
    expect(json[:user][:id]).to eq(sana.user_id)
    expect(sana.user.reload.verified?(:email)).to be true
    expect(json[:businesses].map { |b| b[:name] }).to contain_exactly("Sana Cafe", "Victim Grill")
  end

  it "lists, resends and cancels invitations for staff.manage only" do
    signup_stranger(phone: cashier_phone)
    api_post "/api/v1/staff", { name: "Ali", phone: cashier_phone, role_id: role.("cashier").id }, headers: headers
    id = json[:invitation][:id]
    get "/api/v1/staff/invitations", headers: headers
    expect(json[:data].map { |i| i[:id] }).to eq([ id ])
    expect(json[:data].first[:url]).to match(%r{/invite/#{id}[0-9a-f]{32}\z})
    api_post "/api/v1/staff", { name: "Ali again", phone: cashier_phone, role_id: role.("cashier").id }, headers: headers
    expect(json[:error][:code]).to eq("staff.invited")
    get "/api/v1/staff/invitations", headers: auth_headers(add_member!(biz, "accountant"))
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/staff/invitations/#{id}/resend", {}, headers: headers
    expect(response).to have_http_status(:ok)
    delete "/api/v1/staff/invitations/#{id}", headers: headers
    expect(response).to have_http_status(:no_content)
    api_post "/api/v1/auth/otp/verify", { phone: cashier_phone, code: otp(cashier_phone, "login"), new_login: true }
    expect(response).to have_http_status(:forbidden) # nothing waits any more: the stranger's login needs its password
  end

  it "invites a rider whose phone is on an unproven login, and links the rider record when they join" do
    signup_stranger(phone: cashier_phone)
    api_post "/api/v1/riders", { name: "Rider Ali", phone: cashier_phone, create_login: true }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json).to include(invited: true)
    rider_id = json[:id]
    api_post "/api/v1/auth/otp/verify", { phone: cashier_phone, code: otp(cashier_phone, "login"), app: "rider", new_login: true }
    expect(response).to have_http_status(:ok), response.body
    expect(within(biz) { Rider.find(rider_id).membership_id }).to eq(json[:membership][:id])
  end

  it "signs the holder of a proven phone in as themself, whatever new_login says, and joins the invitation" do
    proven = create(:user, email: "proven@example.com", phone: "+923331230030", phone_verified_at: 1.day.ago)
    within(biz) { StaffInvitation.create!(role: role.("manager"), name: "Proven", phone: proven.phone, staff_type: "admin", expires_at: 1.day.from_now) }
    api_post "/api/v1/auth/otp/verify", { phone: proven.phone, code: otp(proven.phone, "login"), new_login: true }
    expect(response).to have_http_status(:ok), response.body
    expect(json[:user][:id]).to eq(proven.id)
    expect(json[:business][:id]).to eq(biz.id)
  end

  describe "proving a phone" do
    it "asks the login's password once when the phone was never confirmed on an email login, then just the code" do
      api_post "/api/v1/auth/signup", { name: "Owner Two", business_name: "Two", email: "two@example.com", password: "password123", phone: "+923331230010" }
      api_post "/api/v1/auth/otp/verify", { phone: "+923331230010", code: otp("+923331230010", "login") }
      expect(json[:error][:code]).to eq("phone.password_required")
      code = otp("+923331230010", "login")
      api_post "/api/v1/auth/otp/verify", { phone: "+923331230010", code: code, password: "nope" }
      expect(json[:error][:code]).to eq("login.invalid")
      api_post "/api/v1/auth/otp/verify", { phone: "+923331230010", code: code, password: "password123" }
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/auth/otp/verify", { phone: "+923331230010", code: otp("+923331230010", "login") }
      expect(response).to have_http_status(:ok)
    end

    it "takes a number at sign-up by code from a login that never proved it, and refuses one that did" do
      signup_stranger(phone: cashier_phone)
      api_post "/api/v1/auth/signup", { name: "Ali", business_name: "Ali Tea", phone: cashier_phone, otp_code: otp(cashier_phone, "signup") }
      expect(response).to have_http_status(:created)
      expect(User.find(json[:user][:id]).verified?(:phone)).to be true
      api_post "/api/v1/auth/signup", { name: "Again", business_name: "Again Tea", phone: cashier_phone, otp_code: otp(cashier_phone, "signup") }
      expect(response).to have_http_status(:conflict)
    end

    it "keeps a phone off an email sign-up when another login has it, the business keeping it as its phone" do
      create(:user, email: "first@example.com", phone: "+923331230011")
      api_post "/api/v1/auth/signup", { name: "B", business_name: "B Cafe", email: "b@example.com", password: "password123", phone: "+923331230011" }
      expect(response).to have_http_status(:created)
      expect(json[:user][:phone]).to be_nil
      expect(json[:business][:phone]).to eq("+923331230011")
      create(:user, email: nil, password: nil, phone: "+923331230012", phone_verified_at: Time.current)
      api_post "/api/v1/auth/signup", { name: "C", business_name: "C Cafe", email: "c@example.com", password: "password123", phone: "+923331230012" }
      expect(response).to have_http_status(:conflict)
    end

    it "confirms a phone on /me with its code, taking it from a login that never proved it; the password alone leaves it unproven" do
      signup_stranger(phone: cashier_phone)
      api_patch "/api/v1/me", { phone: cashier_phone, current_password: "password123" }, headers: headers
      expect(json[:error][:code]).to eq("phone.taken")
      api_patch "/api/v1/me", { phone: cashier_phone, otp_code: otp(cashier_phone, "verify_phone") }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(owner.user.reload).to have_attributes(phone: cashier_phone, phone_verified_at: be_present)
      expect(User.find_by(email: "stranger@example.com").phone).to be_nil
      api_patch "/api/v1/me", { phone: "+923331230013", current_password: "password123" }, headers: headers
      expect(owner.user.reload).to have_attributes(phone: "+923331230013", phone_verified_at: nil)
    end

    it "changes nothing about the login from a till's PIN session but the language" do
      cashier = add_member!(biz, "cashier", pin: "2468")
      till = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
      pin_headers = auth_headers(cashier, app: "pos", device: till)
      api_patch "/api/v1/me", { phone: "+923331230014", otp_code: otp("+923331230014", "verify_phone") }, headers: pin_headers
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("me.pin_session")
      api_patch "/api/v1/me", { locale: "ur" }, headers: pin_headers
      expect(response).to have_http_status(:ok)
    end
  end

  it "drops a password the owner typed for a phone-only login once its holder signs in by code or adds an email" do
    api_post "/api/v1/staff", { name: "Till Ali", phone: "+923331230040", password: "owner-knows-it", role_id: role.("manager").id, staff_type: "admin" }, headers: headers
    ali = User.find_by!(phone: "+923331230040")
    expect(ali.password_digest).to be_present
    api_post "/api/v1/auth/otp/verify", { phone: ali.phone, code: otp(ali.phone, "login") }
    expect(response).to have_http_status(:ok)
    expect(ali.reload).to have_attributes(password_digest: nil, phone_verified_at: be_present)
    session = { "Authorization" => "Bearer #{json[:access_token]}", "Content-Type" => "application/json" }
    ali.update_columns(password_digest: BCrypt::Password.create("owner-knows-it")) # a login from before this fix
    api_post "/api/v1/me/email_code", { email: "ali.own@example.com" }, headers: session
    api_patch "/api/v1/me", { email: "ali.own@example.com", email_code: json[:dev_code] }, headers: session
    expect(response).to have_http_status(:ok)
    expect(ali.reload.password_digest).to be_nil
    api_post "/api/v1/auth/login", { email: "ali.own@example.com", password: "owner-knows-it" }
    expect(response).to have_http_status(:unauthorized)
  end

  it "clears a returning member's old PIN when another active member took it, on accepting an invitation" do
    stranger = signup_stranger(phone: cashier_phone)
    old = within(biz) { Membership.create!(user: stranger, role: role.("cashier"), status: "active").tap { |m| m.set_pin!("2580") } }
    within(biz) { old.deactivate! }
    add_member!(biz, "waiter", pin: "2580")
    within(biz) { StaffInvitation.create!(role: role.("cashier"), name: "Back", phone: cashier_phone, staff_type: "cashier", expires_at: 1.day.from_now) }
    api_post "/api/v1/auth/otp/verify", { phone: cashier_phone, code: otp(cashier_phone, "login"), password: "stranger-pass", app: "pos" }
    expect(response).to have_http_status(:ok), response.body
    expect(within(biz) { old.reload }).to have_attributes(status: "active", pin_digest: nil)
  end

  it "confirms an email on /me with a code sent to it" do
    api_post "/api/v1/me/email_code", {}, headers: headers
    expect(json).to include(sent: true, email: owner.user.email)
    api_patch "/api/v1/me", { email: owner.user.email, email_code: json[:dev_code] }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(owner.user.reload.verified?(:email)).to be true
  end

  describe "existing data" do
    it "counts a sign-up code at the login's making, a phone login only on a login with no email, and no email" do
      code = ->(u, purpose, at) { OtpCode.create!(phone: u.phone, purpose: purpose, code_digest: "x", expires_at: 1.minute.from_now, consumed_at: at) }
      signed_up = create(:user, email: nil, password: nil, phone: "+923331230020")
      phone_only = create(:user, email: nil, password: nil, phone: "+923331230021")
      with_email = create(:user, phone: "+923331230022") # a stranger's email and password may sit beside the number
      typed = create(:user, email: nil, password: nil, phone: "+923331230023")
      stale = create(:user, email: nil, password: nil, phone: "+923331230024")
      late_signup = create(:user, email: nil, password: nil, phone: "+923331230025")
      code.(signed_up, "signup", signed_up.created_at - 2.seconds)
      code.(phone_only, "login", Time.current)
      code.(with_email, "login", Time.current)
      OtpCode.create!(phone: typed.phone, purpose: "login", code_digest: "x", expires_at: 1.minute.from_now) # sent, never used
      code.(stale, "login", 2.days.ago) # before this login had the number
      code.(late_signup, "signup", 1.hour.from_now) # a failed sign-up with a number already taken
      User.update_all(phone_verified_at: nil, email_verified_at: nil)
      ActiveRecord::Migration.suppress_messages { VerifiedIdentitiesAndStaffInvitations.new.backfill }
      expect([ signed_up, phone_only, with_email, typed, stale, late_signup ].map { |u| u.reload.verified?(:phone) }).to eq([ true, true, false, false, false, false ])
      expect(User.where.not(email_verified_at: nil).count).to eq(0)
    end

    it "keeps every existing membership and login working" do
      linked = create(:user, email: "old.link@example.com", password: "password123") # linked before proofs existed
      within(biz) { Membership.create!(user: linked, role: role.("manager"), status: "active") }
      api_post "/api/v1/auth/login", { email: "old.link@example.com", password: "password123" }
      expect(response).to have_http_status(:ok)
      expect(json[:business][:id]).to eq(biz.id)
    end
  end
end

require "rails_helper"

# Screen walk of 7 Nov 2026 (L2): a member added from Staff on the Rider role got no rider profile, unlike one added
# from Riders, so the rider app's GET /rider/deliveries and /rider/float answered 403 rider.none and it stayed on
# "loading". Every way onto the Rider role makes sure of an active profile. And the Riders page could not tell an owner
# what an add became: an invitation, a linked login, or a person already on the staff.
RSpec.describe "Rider profiles and rider logins", type: :request do
  let!(:owner) { signup_business(name: "Victim Grill") }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:role) { ->(key) { within(biz) { Role.find_by!(system_key: key) } } }

  def member(id) = within(biz) { Membership.find(id) }
  def rider_of(m) = within(biz) { Rider.find_by(membership_id: m.id) }

  def opens_rider_app(m)
    h = auth_headers(m, app: "rider")
    get "/api/v1/rider/deliveries", headers: h
    expect(response).to have_http_status(:ok), response.body
    expect(json[:rider][:id]).to eq(rider_of(m).id)
    get "/api/v1/rider/float", headers: h
    expect(response).to have_http_status(:ok), response.body
  end

  describe "a member put on the Rider role from Staff" do
    it "gets a rider profile on their branch when added, and the rider app opens" do
      api_post "/api/v1/staff", { name: "Kashif Raza", phone: "+923211234567", role_id: role.("rider").id, all_branches: false, branch_ids: [ branch.id ], pin: "4321", staff_type: "admin" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      m = member(json[:id])
      expect(rider_of(m)).to have_attributes(name: "Kashif Raza", phone: "+923211234567", branch_id: branch.id, active: true, temporary: false, status: "available")
      opens_rider_app(m)
    end

    it "on all branches, gets a rider every branch lists; a member on another role gets none" do
      api_post "/api/v1/staff", { name: "Naveed", phone: "+923211234568", role_id: role.("rider").id }, headers: headers
      expect(rider_of(member(json[:id]))).to have_attributes(branch_id: nil, active: true)
      api_post "/api/v1/staff", { name: "Sara", phone: "+923211234569", role_id: role.("cashier").id }, headers: headers
      expect(rider_of(member(json[:id]))).to be_nil
    end

    it "gets one when moved onto the role, and the same one back after it was deactivated" do
      cashier = add_member!(biz, "cashier")
      api_patch "/api/v1/staff/#{cashier.id}", { role_id: role.("rider").id }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      rider = rider_of(cashier)
      expect(rider).to have_attributes(name: cashier.user.name, active: true)
      opens_rider_app(member(cashier.id))
      delete "/api/v1/riders/#{rider.id}", headers: headers
      expect(rider.reload.archived_at).to be_present
      api_patch "/api/v1/staff/#{cashier.id}", { role_id: role.("cashier").id }, headers: headers
      api_patch "/api/v1/staff/#{cashier.id}", { role_id: role.("rider").id }, headers: headers
      expect(rider.reload).to have_attributes(active: true, archived_at: nil)
      expect(within(biz) { Rider.where(membership_id: cashier.id).count }).to eq(1)
    end

    it "takes over a rider added without a login on the same phone, keeping its float" do
      api_post "/api/v1/riders", { name: "Bilal", phone: "+923211230001", vehicle: "bike" }, headers: headers
      loose = within(biz) { Rider.find(json[:id]) }
      within(biz) { loose.update_columns(float_minor: 50_000) }
      api_post "/api/v1/staff", { name: "Bilal Ahmed", phone: "+923211230001", role_id: role.("rider").id }, headers: headers
      m = member(json[:id])
      expect(rider_of(m).id).to eq(loose.id)
      expect(within(biz) { Rider.where(phone: "+923211230001").count }).to eq(1)
      get "/api/v1/rider/float", headers: auth_headers(m, app: "rider")
      expect(json[:float_minor]).to eq(50_000)
    end

    it "gets one when they accept an invitation to the Rider role" do
      api_post "/api/v1/auth/signup", { name: "Stranger", business_name: "Stranger Cafe", email: "stranger@example.com", password: "stranger-pass", phone: "+923211230002" }
      api_post "/api/v1/staff", { name: "Imran", phone: "+923211230002", role_id: role.("rider").id, pin: "5199" }, headers: headers
      expect(response).to have_http_status(:accepted)
      expect(within(biz) { Rider.count }).to eq(0) # nobody joined yet
      token = within(biz) { StaffInvitation.last.token }
      api_post "/api/v1/invitations/#{token}/code", {}
      api_post "/api/v1/invitations/#{token}/accept", { code: json[:dev_code], new_login: true }
      expect(response).to have_http_status(:created), response.body
      expect(json[:message]).to include("rider app")
      m = member(within(biz) { StaffInvitation.last.membership_id })
      expect(rider_of(m)).to have_attributes(name: "Imran", phone: "+923211230002", active: true)
      opens_rider_app(m)
    end
  end

  describe "POST /riders with a login" do
    it "says when the login waits as an invitation, and the invitation is the staff list's" do
      api_post "/api/v1/auth/signup", { name: "Stranger", business_name: "Stranger Cafe", email: "stranger2@example.com", password: "stranger-pass", phone: "+923211230003" }
      api_post "/api/v1/riders", { name: "Asif", phone: "+923211230003", vehicle: "bike", create_login: true, pin: "6060" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json).to include(name: "Asif", membership_id: nil, invited: true, linked_existing_user: false)
      expect(json[:invitation]).to include(name: "Asif", phone: "+923211230003", rider_id: json[:id], has_pin: true, status: "pending")
      get "/api/v1/staff/invitations", headers: headers
      expect(json[:data].map { |i| i[:rider_id] }).to include(within(biz) { Rider.find_by!(name: "Asif").id })
    end

    it "says when a login of theirs was linked, and when one was made" do
      proven = create(:user, email: nil, password: nil, phone: "+923211230004", phone_verified_at: 1.day.ago)
      api_post "/api/v1/riders", { name: "Proven", phone: proven.phone, create_login: true, pin: "7070" }, headers: headers
      expect(json).to include(linked_existing_user: true)
      expect(json).not_to have_key(:invited)
      expect(member(json[:membership_id]).user_id).to eq(proven.id)
      api_post "/api/v1/riders", { name: "Fresh", phone: "+923211230005", create_login: true, pin: "8080" }, headers: headers
      expect(json).to include(linked_existing_user: false)
      api_post "/api/v1/riders", { name: "No login", phone: "+923211230006" }, headers: headers
      expect(json).not_to have_key(:linked_existing_user)
    end

    it "refuses a phone already on the staff in words the page can show, and adds nothing" do
      cashier = add_member!(biz, "cashier")
      within(biz) { cashier.user.update!(phone: "+923211230007") }
      api_post "/api/v1/riders", { name: "Twice", phone: "+923211230007", create_login: true, pin: "9090" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "staff.exists")
      expect(json[:error][:message]).to include(cashier.user.name, "Rider role in Staff")
      expect(within(biz) { Rider.where(name: "Twice").count }).to eq(0)
    end
  end
end

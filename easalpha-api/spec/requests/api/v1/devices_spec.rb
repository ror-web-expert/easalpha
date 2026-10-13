require "rails_helper"

RSpec.describe "Devices and PIN login", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }

  def add_cashier(pin: "4321")
    within(owner.business) do
      m = Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active")
      m.set_pin!(pin)
      m
    end
  end

  it "creates a till, pairs it with the one-time code, then logs a cashier in by PIN" do
    api_post "/api/v1/devices", { name: "Counter till", kind: "till" }, headers: headers
    expect(response).to have_http_status(:created)
    code = json[:pairing_code]
    expect(code).to match(/\A\d{6}\z/)
    expect(json[:code]).to eq("T1")

    api_post "/api/v1/devices/pair", { pairing_code: code, platform: "windows", app_version: "0.1.0" }
    expect(response).to have_http_status(:ok)
    device_token = json[:device_token]
    expect(json[:device][:paired]).to be true

    api_post "/api/v1/devices/pair", { pairing_code: code }
    expect(response).to have_http_status(:unauthorized)

    cashier = add_cashier(pin: "4321")
    api_post "/api/v1/devices/pin_login", { pin: "4321" }, headers: { "Authorization" => "Bearer #{device_token}" }
    expect(response).to have_http_status(:ok)
    expect(json[:app]).to eq("pos")
    expect(json[:membership][:id]).to eq(cashier.id)
    expect(json[:permissions]).to include("orders.create")
    expect(json[:permissions]).not_to include("orders.refund")
  end

  it "sets a device up from the machine itself: a manager login creates and pairs it in one call and lists who can sign in" do
    cashier = add_cashier(pin: "4321")
    api_post "/api/v1/devices/register", { name: "Counter 1", kind: "till", platform: "windows", app_version: "0.2.0" }, headers: headers
    expect(response).to have_http_status(:created)
    token = json[:device_token]
    expect(token).to be_present
    expect(json[:device]).to include(paired: true, kind: "till", name: "Counter 1", platform: "windows")
    expect(json[:device]).not_to have_key(:pairing_code)
    expect(json[:branch][:id]).to eq(within(owner.business) { Branch.first.id })
    me = json[:staff].find { |s| s[:id] == cashier.id }
    expect(me).to include(has_pin: true, role: "Cashier")
    expect(json[:staff].map { |s| s[:id] }).to include(owner.id)

    api_post "/api/v1/devices/pin_login", { pin: "4321" }, headers: { "Authorization" => "Bearer #{token}" }
    expect(response).to have_http_status(:ok)
    expect(json[:app]).to eq("pos")
    expect(within(owner.business) { AuditLog.where(action: "pair_device").last.after }).to include("via" => "setup")
  end

  it "registers a kitchen display with the kitchen staff only, and a token screen with nobody" do
    cashier = add_cashier(pin: "4321")
    cook = within(owner.business) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "kitchen"), status: "active") }
    api_post "/api/v1/devices/register", { name: "Kitchen 1", kind: "kitchen", platform: "web" }, headers: headers
    expect(response).to have_http_status(:created)
    ids = json[:staff].map { |s| s[:id] }
    expect(ids).to include(cook.id)
    expect(ids).not_to include(cashier.id)
    expect(json[:staff].find { |s| s[:id] == cook.id }[:has_pin]).to be false

    api_post "/api/v1/devices/register", { name: "Pickup screen", kind: "token_screen", platform: "web" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:staff]).to eq([])
    expect(json[:device][:code]).to eq("S1")
  end

  it "needs the devices permission to register, and counts tills against the plan" do
    cashier = add_cashier
    api_post "/api/v1/devices/register", { name: "Rogue", kind: "till" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)

    limit = owner.business.plan_limit("tills")
    if limit
      limit.times { |i| api_post "/api/v1/devices/register", { name: "Till #{i}", kind: "till" }, headers: headers; expect(response).to have_http_status(:created) }
      api_post "/api/v1/devices/register", { name: "One too many", kind: "till" }, headers: headers
      expect(response).to have_http_status(:forbidden)
      expect(json.dig(:error, :code)).to eq("plan.limit")
    end
  end

  it "locks the till, not the staff, after five wrong PINs" do
    allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new) # the test store keeps nothing
    device = within(owner.business) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
    other = within(owner.business) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current) }
    cashier = add_cashier(pin: "1111")
    5.times { api_post "/api/v1/devices/pin_login", { pin: "9999" }, headers: device_headers(device) }
    expect(response).to have_http_status(:unauthorized)
    expect(json.dig(:error, :code)).to eq("pin.invalid")
    api_post "/api/v1/devices/pin_login", { pin: "1111" }, headers: device_headers(device)
    expect(response).to have_http_status(:unauthorized)
    expect(json.dig(:error, :code)).to eq("pin.locked")
    # A stranger's wrong tries on one till never lock the cashier out of the next till.
    expect(cashier.reload.pin_locked?).to be false
    api_post "/api/v1/devices/pin_login", { pin: "1111" }, headers: device_headers(other)
    expect(response).to have_http_status(:ok)
  end

  it "blocks a waiter from the kitchen device and a revoked device from everything" do
    kitchen = within(owner.business) { Device.create!(branch: Branch.first, name: "Kitchen", kind: "kitchen", paired_at: Time.current) }
    waiter = within(owner.business) { m = Membership.create!(user: create(:user), role: Role.find_by!(system_key: "waiter"), status: "active"); m.set_pin!("2222"); m }
    api_post "/api/v1/devices/pin_login", { pin: "2222" }, headers: device_headers(kitchen)
    expect(response).to have_http_status(:forbidden)
    delete "/api/v1/devices/#{kitchen.id}", headers: headers
    expect(response).to have_http_status(:no_content)
    api_post "/api/v1/devices/heartbeat", {}, headers: device_headers(kitchen)
    expect(response).to have_http_status(:unauthorized)
    expect(waiter.reload.pin_digest).to be_present
  end

  it "enforces the till limit of the plan" do
    within(owner.business) { owner.business.update!(plan: Plan.find_by!(code: "starter")) }
    api_post "/api/v1/devices", { name: "Till 1" }, headers: headers
    api_post "/api/v1/devices", { name: "Till 2" }, headers: headers
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("plan.limit")
  end

  it "pin login respects branch assignment" do
    second = within(owner.business) { Branch.create!(name: "DHA", code: "B2") }
    device = within(owner.business) { Device.create!(branch: second, name: "DHA till", kind: "till", paired_at: Time.current) }
    cashier = within(owner.business) do
      m = Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active", all_branches: false, branch_ids: [ Branch.find_by!(is_main: true).id ])
      m.set_pin!("5555"); m
    end
    api_post "/api/v1/devices/pin_login", { pin: "5555" }, headers: device_headers(device)
    expect(response).to have_http_status(:unauthorized)
    expect(cashier.reload.pin_failed_count).to eq(0)
  end

  include_examples "tenant isolated", -> { "/api/v1/devices/#{within(owner.business) { Device.create!(branch: Branch.first, name: 'X', kind: 'till').id }}" }, methods: %i[patch delete]
end

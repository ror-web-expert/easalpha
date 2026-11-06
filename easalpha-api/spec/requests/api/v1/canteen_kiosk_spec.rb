require "rails_helper"

# What a kiosk may learn about the workers (6 Nov review): never a phone or CNIC; the list it needs to name a finger
# offline whatever manual lookup says, with the reader's id only as a hash; one worker's record for canteen managers.
RSpec.describe "Canteen kiosk worker payloads", type: :request do
  let!(:owner) { signup_business(name: "Steel Works Mess") }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:kiosk) { within(biz) { Device.create!(branch: Branch.first, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1") } }
  let!(:worker) { within(biz) { Employee.create!(name: "Akbar Ali", phone: "+923001112233", cnic: "35202-1234567-1", base_salary_minor: 3_000_000, pay_frequency: "monthly", fingerprint_id: "FP-001", fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current) } }
  let(:hash) { Digest::SHA256.hexdigest("#{biz.id}:fp-001") }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  it "ships the list without phone, CNIC or the reader's id while manual lookup is on; the admin still sees them" do
    get "/api/v1/canteen/sync", headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json[:fingerprint_salt]).to eq(biz.id)
    expect(json[:workers].first).to include(id: worker.id, name: "Akbar Ali", fingerprint_hash: hash)
    expect(json[:workers].first.keys).not_to include(:phone, :cnic, :fingerprint_id)
    get "/api/v1/canteen/workers", params: { q: "0300 111 2233" }, headers: device_headers(kiosk)
    expect(json[:data].first).to include(name: "Akbar Ali")
    expect(json[:data].first.keys).not_to include(:phone, :cnic, :fingerprint_id)
    get "/api/v1/sync/changes", headers: device_headers(kiosk)
    expect(json[:canteen][:workers].first).to include(fingerprint_hash: hash)
    expect(json[:canteen][:workers].first.keys).not_to include(:phone, :cnic, :fingerprint_id)
    get "/api/v1/canteen/workers", headers: headers
    expect(json[:data].first).to include(phone: "+923001112233", cnic: "35202-1234567-1", fingerprint_id: "FP-001")
  end

  # canteen-payroll#1, deploy-upgrade#3: with manual lookup off the kiosk got workers: [] and could name no finger
  # offline, so the canteen stopped at the reader whenever the internet dropped.
  it "ships the list once manual lookup is off too; only the name search and claims by employee id are refused" do
    api_patch "/api/v1/settings", { values: { "canteen.manual_lookup" => false } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    get "/api/v1/canteen/sync", headers: device_headers(kiosk)
    expect(json[:workers].map { |w| w.slice(:id, :name, :fingerprint_hash) }).to eq([ { id: worker.id, name: "Akbar Ali", fingerprint_hash: hash } ])
    get "/api/v1/canteen/workers", headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/canteen/workers", params: { q: "Akbar" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/canteen/lookup", params: { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json).to include(id: worker.id, name: "Akbar Ali")
    expect(json.keys).not_to include(:phone, :cnic, :fingerprint_id)
    get "/api/v1/canteen/lookup", params: { fingerprint_id: "FP-999" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:not_found)
    lunch = within(biz) { MealSession.create!(branch: Branch.first, name: "Lunch", starts_at: "02:01", ends_at: "02:00") } # the whole business day
    api_post "/api/v1/canteen/plans", { meal_session_id: lunch.id, plan_date: today_for(biz).to_s, items: [ { product_id: m[:chai].id } ], publish: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/canteen/claims", { employee_id: worker.id, source: "manual" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("canteen.manual_lookup")
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body
    expect(json[:employee_name]).to eq("Akbar Ali")
  end

  # canteen-payroll#2, contracts#4: GET /canteen/workers/:id handed any paired device every worker's phone and CNIC.
  it "gives one worker's record, phone and CNIC to canteen managers only" do
    till = within(biz) { Device.create!(branch: Branch.first, name: "Till 1", kind: "till", paired_at: Time.current, code: "T1") }
    screen = within(biz) { Device.create!(branch: Branch.first, name: "Tokens", kind: "token_screen", paired_at: Time.current, code: "S1") }
    [ kiosk, till, screen ].each do |device|
      get "/api/v1/canteen/workers/#{worker.id}", headers: device_headers(device)
      expect(response).to have_http_status(:unauthorized), device.kind
      expect(response.body).not_to include("35202")
    end
    cashier = add_member!(biz, "cashier")
    get "/api/v1/canteen/workers/#{worker.id}", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/canteen/workers", headers: auth_headers(cashier) # the kiosk screens' list, on a cashier's login
    expect(response).to have_http_status(:ok)
    expect(json[:data].first.keys).not_to include(:phone, :cnic, :fingerprint_id)
    get "/api/v1/canteen/workers/#{worker.id}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:worker]).to include(phone: "+923001112233", cnic: "35202-1234567-1")
  end
end

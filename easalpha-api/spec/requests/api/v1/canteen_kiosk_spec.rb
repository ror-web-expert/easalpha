require "rails_helper"

# What a kiosk may learn about the workers (6 Nov review): never a phone or CNIC; the full list only while manual
# lookup is on; otherwise one worker by exact fingerprint or employee id.
RSpec.describe "Canteen kiosk worker payloads", type: :request do
  let!(:owner) { signup_business(name: "Steel Works Mess") }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:kiosk) { within(biz) { Device.create!(branch: Branch.first, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1") } }
  let!(:worker) { within(biz) { Employee.create!(name: "Akbar Ali", phone: "+923001112233", cnic: "35202-1234567-1", base_salary_minor: 3_000_000, pay_frequency: "monthly", fingerprint_id: "FP-001", fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current) } }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  it "ships the list without phone or CNIC while manual lookup is on; the admin still sees them" do
    get "/api/v1/canteen/sync", headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json[:workers].first).to include(name: "Akbar Ali", fingerprint_id: "FP-001")
    expect(json[:workers].first.keys).not_to include(:phone, :cnic)
    get "/api/v1/canteen/workers", params: { q: "0300 111 2233" }, headers: device_headers(kiosk)
    expect(json[:data].first).to include(name: "Akbar Ali")
    expect(json[:data].first.keys).not_to include(:phone, :cnic)
    get "/api/v1/sync/changes", headers: device_headers(kiosk)
    expect(json[:canteen][:workers].first.keys).not_to include(:phone, :cnic)
    get "/api/v1/canteen/workers", headers: headers
    expect(json[:data].first).to include(phone: "+923001112233", cnic: "35202-1234567-1")
  end

  it "ships no list once manual lookup is off; a kiosk then names a finger by exact id and still claims" do
    api_patch "/api/v1/settings", { values: { "canteen.manual_lookup" => false } }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    get "/api/v1/canteen/sync", headers: device_headers(kiosk)
    expect(json[:workers]).to eq([])
    get "/api/v1/canteen/workers", headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/canteen/workers", params: { q: "Akbar" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/canteen/lookup", params: { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:ok)
    expect(json).to include(id: worker.id, name: "Akbar Ali")
    expect(json.keys).not_to include(:phone, :cnic)
    get "/api/v1/canteen/lookup", params: { employee_id: worker.id }, headers: device_headers(kiosk)
    expect(json[:name]).to eq("Akbar Ali")
    get "/api/v1/canteen/lookup", params: { fingerprint_id: "FP-999" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:not_found)
    lunch = within(biz) { MealSession.create!(branch: Branch.first, name: "Lunch", starts_at: "00:00", ends_at: "23:59") }
    api_post "/api/v1/canteen/plans", { meal_session_id: lunch.id, plan_date: today_for(biz).to_s, items: [ { product_id: m[:chai].id } ], publish: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
    expect(response).to have_http_status(:created), response.body
    expect(json[:employee_name]).to eq("Akbar Ali")
  end
end

require "rails_helper"

# SPEC: settings as a typed key-value store per outlet, grouped as the five settings areas, with seeded defaults and a
# version stamp the POS compares against.
RSpec.describe "Settings store", type: :request do
  let!(:owner) { signup_business(modules: false) } # a fresh business: no settings written yet
  let(:headers) { auth_headers(owner) }
  let(:cashier) { within(owner.business) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active") } }

  it "reads the five groups with defaults and a version of zero" do
    get "/api/v1/settings", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:version]).to eq(0)
    expect(json[:groups].keys).to eq(%i[store point_of_sale charges_tax inventory security_cash])
    kds = json[:groups][:point_of_sale][:screens][:"KDS Alerts"]
    expect(kds.find { |k| k[:key] == "pos.kds.new_order_sound" }[:value]).to be false
    expect(json[:groups][:point_of_sale][:screens].keys).to include(:"Customer Required", :"Order Behavior", :"Print Server", :"Pending Order Reminder")
  end

  it "patches keys, bumps the version, mirrors legacy keys and masks secrets" do
    api_patch "/api/v1/settings", { values: { "pos.kds.timeout_minutes" => "12", "charges.service_charge.value" => 5, "tax.pra.access_code" => "ABC" } }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:version]).to eq(1)
    expect(json[:values]).to include("pos.kds.timeout_minutes": 12, "tax.pra.access_code": "set")
    within(owner.business) do
      expect(owner.business.reload.setting("pos.kds.timeout_minutes")).to eq(12)
      expect(owner.business.setting("service_charge_percent")).to eq(5.0)
    end
    get "/api/v1/settings/version", headers: headers
    expect(json[:version]).to eq(1)
    get "/api/v1/sync/changes", headers: auth_headers(owner, app: "pos")
    expect(json[:settings_version]).to eq(1)
    expect(json[:settings][:"pos.kds.timeout_minutes"]).to eq(12)
  end

  it "needs settings.manage to write but any member may read" do
    api_patch "/api/v1/settings", { values: { "pos.kds.red_sound" => true } }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/settings", headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
  end

  it "rejects an unknown key and a bad PIN" do
    api_patch "/api/v1/settings", { values: { "pos.unknown" => 1 } }, headers: headers
    expect(response).to have_http_status(:bad_request)
    expect(json[:error][:code]).to eq("settings.unknown_key")
    api_patch "/api/v1/settings", { values: { "security.expense_report_pin" => "12" } }, headers: headers
    expect(response).to have_http_status(:bad_request)
    api_patch "/api/v1/settings", { values: { "security.expense_report_pin" => "4321" } }, headers: headers
    expect(json[:values][:"security.expense_report_pin"]).to eq("set")
    get "/api/v1/settings", headers: headers
    pin = json[:groups][:security_cash][:screens][:"Expense & Report PIN"].first
    expect(pin[:value]).to eq("set")
  end
end

require "rails_helper"

# Secrets in the settings (the PRA credentials, the expense and report PIN digest, the Foodpanda webhook secret) are
# used only by the server. The till's catalog and sync go to every cashier and are kept on the device, so they never
# carry them, from a settings row or from the old settings column; the settings screen shows them masked.
RSpec.describe "Secret settings", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier") }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }

  before do
    api_patch "/api/v1/settings", { values: { "tax.pra.access_code" => "PRA-ACCESS-123", "security.expense_report_pin" => "4826", "tax.pra.pos_id" => "POS-9" } }, headers: headers
    expect(response).to have_http_status(:ok)
    api_patch "/api/v1/integrations/foodpanda", { enabled: true, secret: "FOODPANDA-SECRET-321" }, headers: headers
    expect(response).to have_http_status(:ok)
    # A value kept only in the old settings column, which the settings table falls back to.
    within(biz) { biz.reload.update!(settings: biz.settings.merge("tax.pra.bearer_token" => "LEGACY-TOKEN-0000")) }
  end

  let(:pin_digest) { within(biz) { Setting.find_by!(key: "security.expense_report_pin", branch_id: nil).value } }
  let(:secrets) { [ "PRA-ACCESS-123", pin_digest, "LEGACY-TOKEN-0000", "FOODPANDA-SECRET-321" ] }
  let(:secret_keys) { %w[tax.pra.access_code tax.pra.bearer_token security.expense_report_pin] }

  def expect_no_secrets(settings)
    expect(response.body).not_to include(*secrets)
    expect(settings.keys.map(&:to_s)).not_to include(*secret_keys)
    expect(settings[:"tax.pra.pos_id"]).to eq("POS-9") # everything else is still there
    expect(settings[:foodpanda]).to include(enabled: true)
    expect(settings[:foodpanda]).not_to have_key(:secret)
  end

  it "keeps them out of the catalog and the sync, for a cashier and for a paired till" do
    [ auth_headers(cashier, app: "pos"), device_headers(device) ].each do |h|
      get "/api/v1/catalog", headers: h
      expect(response).to have_http_status(:ok)
      expect_no_secrets(json[:business][:settings])

      get "/api/v1/sync/changes", headers: h
      expect(response).to have_http_status(:ok)
      expect_no_secrets(json[:settings])
      expect(json[:business][:settings].keys.map(&:to_s)).not_to include(*secret_keys)
    end

    # The server still has them, and the settings screen still shows that they are set.
    within(biz) { expect(biz.reload.setting("tax.pra.bearer_token")).to eq("LEGACY-TOKEN-0000") }
    get "/api/v1/settings", headers: headers
    pra = json[:groups][:charges_tax][:screens][:"PRA e-IMS"].index_by { |k| k[:key] }
    expect(pra["tax.pra.bearer_token"][:value]).to eq("set")
  end

  it "keeps them out of the business every member's session carries: /me, GET and PATCH /business" do
    [ -> { get "/api/v1/me", headers: auth_headers(cashier, app: "pos") }, -> { get "/api/v1/business", headers: headers },
      -> { api_patch "/api/v1/business", { phone: "+923001234567" }, headers: headers } ].each do |call|
      call.call
      expect(response).to have_http_status(:ok)
      expect(response.body).not_to include(*secrets)
      expect(json[:business] || json).to include(:settings)
    end
  end

  it "keeps them out of the audit rows when the business profile is saved" do
    api_patch "/api/v1/business", { phone: "+923001234567" }, headers: headers
    expect(response).to have_http_status(:ok)
    rows = AuditLog.where(business_id: biz.id).order(:occurred_at).to_a
    expect(rows.last.after).to include("phone" => "+923001234567")
    expect(rows.map { |r| [ r.before, r.after ] }.to_json).not_to include(*secrets)
    within(biz) { expect(Aggregators::Foodpanda.settings(biz.reload)["secret"]).to eq("FOODPANDA-SECRET-321") }
  end
end

RSpec.describe "Modules through the business profile", type: :request do
  let!(:owner) { signup_business(modules: false) }
  let(:biz) { owner.business }
  let(:manager) { add_member!(biz, "manager").tap { |mm| within(biz) { mm.set_permissions!(%w[app.admin settings.manage]) } } }

  it "lets only the owner switch a module, as the settings screen does" do
    h = auth_headers(manager)
    api_patch "/api/v1/business", { settings: biz.settings.merge("modules.customer_accounts" => true) }, headers: h
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("modules.owner_only")
    get "/api/v1/me", headers: h
    expect(json[:modules]).to eq(customer_accounts: false, payroll: false, canteen: false)

    # The rest of the profile, and settings that leave the modules as they are, still save.
    api_patch "/api/v1/business", { phone: "+923001234567", settings: biz.reload.settings.merge("kitchen_ticket_print" => false) }, headers: h
    expect(response).to have_http_status(:ok)
    expect(json[:phone]).to eq("+923001234567")

    api_patch "/api/v1/business", { settings: biz.reload.settings.merge("modules.customer_accounts" => true) }, headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    get "/api/v1/me", headers: auth_headers(owner)
    expect(json[:modules]).to eq(customer_accounts: true, payroll: false, canteen: false)

    # Nor can the manager switch it off again by leaving the key out.
    api_patch "/api/v1/business", { settings: biz.reload.settings.except("modules.customer_accounts") }, headers: h
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("modules.owner_only")
  end
end

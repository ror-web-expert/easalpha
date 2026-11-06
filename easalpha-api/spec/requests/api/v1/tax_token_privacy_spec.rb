require "rails_helper"

# S1 (6 Nov 2026): a branch's tax-authority API token printed on every receipt ("TOKEN QA-PRA-SECRET-TOKEN-42"), sat
# in every till's stored device record, in /branches and /me for any staff login, and in the audit log and its CSV.
# It now stays on the server: receipts carry an allow-list of registration numbers, staff get those numbers, a
# settings manager sees only that a token is saved, and audit rows say "[redacted]".
RSpec.describe "Tax registration token", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let!(:m) { build_menu!(biz) }
  let(:branch) { m[:branch] }
  let(:token) { "QA-PRA-SECRET-TOKEN-42" }
  let(:numbers) { { authority: "pra", ntn: "1234567-8", strn: "32-77-8761-234-56", pos_id: "POS-77" } }

  before do
    api_patch "/api/v1/branches/#{branch.id}", { tax_registration: numbers.merge(token: token) }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  it "keeps the token on the server and shows a settings manager only that one is saved" do
    within(biz) { expect(branch.reload.tax_registration["token"]).to eq(token) }
    expect(response.body).not_to include(token)
    expect(json[:tax_registration]).to include(numbers.merge(token_set: true, token_hint: "ends N-42"))
    get "/api/v1/branches", headers: headers
    expect(response.body).not_to include(token)
    expect(json[:data].first[:tax_registration][:token_set]).to be true
  end

  it "keeps the saved token when the form sends it blank or not at all, and removes it on token_clear" do
    api_patch "/api/v1/branches/#{branch.id}", { tax_registration: numbers.merge(ntn: "7654321-0", token: "") }, headers: headers
    api_patch "/api/v1/branches/#{branch.id}", { tax_registration: numbers.merge(ntn: "7654321-0", token_set: true, token_hint: "x") }, headers: headers
    within(biz) { expect(branch.reload.tax_registration).to eq(numbers.transform_keys(&:to_s).merge("ntn" => "7654321-0", "token" => token)) }
    api_patch "/api/v1/branches/#{branch.id}", { tax_registration: numbers.merge(token_clear: true) }, headers: headers
    expect(json[:tax_registration]).to include(token_set: false)
    within(biz) { expect(branch.reload.tax_registration).not_to have_key("token") }
  end

  it "never sends it to staff: /branches, /me, the catalog, the sync, a till's pairing and its PIN session" do
    cashier = add_member!(biz, "cashier", pin: "2468")
    staff = auth_headers(cashier, app: "pos")
    get "/api/v1/branches", headers: staff
    expect(json[:data].first[:tax_registration]).to eq(numbers)
    get "/api/v1/branches/#{branch.id}", headers: staff
    expect(json[:tax_registration]).to eq(numbers)
    get "/api/v1/me", headers: staff
    expect(json[:branch][:tax_registration]).to eq(numbers)
    get "/api/v1/me", headers: headers # the owner's /me too: the admin keeps the session in localStorage
    expect(response.body).not_to include(token)

    api_post "/api/v1/devices", { name: "Counter till", kind: "till" }, headers: headers
    api_post "/api/v1/devices/pair", { pairing_code: json[:pairing_code], platform: "windows" }
    expect(json[:branch][:tax_registration]).to eq(numbers) # what the till stores as easalpha.device
    till = { "Authorization" => "Bearer #{json[:device_token]}", "Content-Type" => "application/json" }
    [ "/api/v1/catalog", "/api/v1/sync/changes" ].each do |path|
      get path, headers: till
      expect(response).to have_http_status(:ok)
      expect(response.body).not_to include(token)
    end
    api_post "/api/v1/devices/pin_login", { pin: "2468" }, headers: till
    expect(response).to have_http_status(:ok)
    expect(json[:branch][:tax_registration]).to eq(numbers)
    expect(response.body).not_to include(token)
  end

  it "prints the registration numbers on the receipt and never the token" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    order_id = json[:id]
    api_post "/api/v1/orders/#{order_id}/payments", { payments: [ { method_code: "cash", amount_minor: json[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:receipt][:branch][:tax_registration]).to eq(numbers)
    get "/api/v1/orders/#{order_id}/receipt", headers: headers
    expect(json[:branch][:tax_registration]).to eq(numbers)
    expect(response.body).not_to include(token)
  end

  it "writes [redacted] in the audit log, its screen and its CSV, and the redaction rewrites rows stored before" do
    rows = AuditLog.where(business_id: biz.id, table_name: "branches").to_a
    expect(rows.size).to be >= 2 # the branch form's settings_change row and the automatic update row
    expect(rows.map { |r| [ r.before, r.after ] }.to_json).not_to include(token)
    expect(rows.find { |r| r.action == "settings_change" }.after).to include("tax_token" => "changed")

    get "/api/v1/audit_logs?table_name=branches", headers: headers
    expect(response.body).not_to include(token)
    get "/api/v1/exports/audit_logs.csv", headers: headers
    expect(response.body).not_to include(token)

    # A row as the old code wrote it, with the token in both sides, read back and then rewritten in place.
    old = AuditLog.create!(business_id: biz.id, action: "settings_change", table_name: "branches", record_id: branch.id, occurred_at: Time.current,
                           before: { "tax_registration" => { "authority" => "pra", "token" => token } }, after: { "settings" => { "foodpanda" => { "secret" => "FP-SECRET-1" } } })
    get "/api/v1/audit_logs?table_name=branches", headers: headers
    expect(response.body).not_to include(token)
    expect(json[:data].find { |r| r[:id] == old.id }[:before]).to eq(tax_registration: { authority: "pra", token: "[redacted]" })
    expect(AuditLog.redact_stored!).to eq(1)
    old.reload
    expect(old.before).to eq("tax_registration" => { "authority" => "pra", "token" => "[redacted]" })
    expect(old.after).to eq("settings" => { "foodpanda" => { "secret" => "[redacted]" } })
    # The log is append-only again afterwards.
    expect { AuditLog.where(id: old.id).update_all(action: "x") }.to raise_error(ActiveRecord::StatementInvalid, /append-only/)
  end

  it "keeps what is not a secret: a meal token label, a switch named like one, and the registration numbers" do
    expect(AuditLog.redact({ token: "L-012", "canteen.print_token" => true, "pos.print_server.token" => "PS-1", "tax_registration" => { "ntn" => "1", "token" => "T" } }))
      .to eq(token: "L-012", "canteen.print_token" => true, "pos.print_server.token" => "[redacted]", "tax_registration" => { "ntn" => "1", "token" => "[redacted]" })
  end
end

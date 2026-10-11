require "rails_helper"

# SPEC "Roles and permissions": 57 named codes in 12 modules, presets as shortcuts, grants per user, surface badges,
# restriction codes, changes at the next sign-in.
RSpec.describe "Per-user permissions", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }
  let(:cashier_role) { within(owner.business) { Role.find_by!(system_key: "cashier") } }
  let(:cashier) { within(owner.business) { Membership.create!(user: create(:user), role: cashier_role, status: "active") } }

  describe "registry" do
    it "lists the SPEC codes with module, surface and restriction, and the EasAlpha extras" do
      get "/api/v1/roles/permissions", headers: headers
      expect(response).to have_http_status(:ok)
      spec = json[:data].select { |p| p[:spec] }
      expect(spec.size).to eq(57)
      expect(spec.map { |p| p[:module] }.uniq.size).to eq(12)
      expect(json[:data].reject { |p| p[:spec] }.size).to eq(46)
      printers = json[:data].find { |p| p[:code] == "PRINTERS" }
      expect(printers[:surface]).to eq("software")
      expect(json[:data].find { |p| p[:code] == "REQUIRE_PIN_FOR_ORDER_UPDATE" }[:restriction]).to be true
      expect(json[:modules].last).to eq("EasAlpha extras")
    end

    it "offers the three presets" do
      get "/api/v1/roles/presets", headers: headers
      expect(json[:data].map { |p| p[:key] }).to eq(%w[cashier supervisor manager])
      expect(json[:data].last[:codes]).not_to include("REQUIRE_PIN_FOR_ORDER_UPDATE")
    end
  end

  describe "PUT /staff/:id/permissions" do
    it "grants a custom set and the implied EasAlpha codes come with it" do
      api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: %w[SALES_WALKIN CANCEL_ORDER KDS] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:mode]).to eq("custom")
      expect(json[:granted]).to match_array(%w[SALES_WALKIN CANCEL_ORDER KDS])
      expect(json[:effective]).to include("orders.create", "orders.void", "app.kitchen", "kitchen.bump")
      expect(json[:modules].find { |m| m[:name] == "Take Orders" }).to include(total: 3, granted: 1)
      expect(json[:takes_effect]).to eq("next sign-in")
    end

    it "applies a preset, select all, and resets to the role" do
      api_put "/api/v1/staff/#{cashier.id}/permissions", { preset: "supervisor" }, headers: headers
      expect(json[:granted]).to include("REOPEN_ORDER", "DELETE_ORDER_ITEM")
      api_put "/api/v1/staff/#{cashier.id}/permissions", { select_all: true }, headers: headers
      expect(json[:granted].size).to eq(57)
      api_put "/api/v1/staff/#{cashier.id}/permissions", { reset: true }, headers: headers
      expect(json[:mode]).to eq("role")
      expect(json[:effective]).to include("orders.create", "SALES_WALKIN")
      expect(json[:effective]).not_to include("CANCEL_ORDER")
    end

    it "is denied without staff.manage" do
      api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: %w[SALES_WALKIN] }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("permission.denied")
    end

    it "rejects an unknown code and never narrows the owner" do
      api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: %w[FLY_TO_MOON] }, headers: headers
      expect(response).to have_http_status(:bad_request)
      api_put "/api/v1/staff/#{owner.id}/permissions", { codes: %w[SALES_WALKIN] }, headers: headers
      expect(response).to have_http_status(:bad_request)
      get "/api/v1/staff/#{owner.id}/permissions", headers: headers
      expect(json[:owner]).to be true
      expect(json[:granted]).to include("SALES_WALKIN", "staff.manage")
    end

    it "writes an audit row" do
      api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: %w[SALES_WALKIN] }, headers: headers
      get "/api/v1/audit_logs?action_name=permission_change", headers: headers
      expect(json[:data].first[:after][:granted]).to eq(%w[SALES_WALKIN])
    end
  end

  describe "next sign-in" do
    it "keeps the old set on a token issued before the change and gives the new set on a fresh login" do
      within(owner.business) { cashier.set_pin!("1234") }
      old_headers = auth_headers(cashier)
      api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: %w[KDS] }, headers: headers
      get "/api/v1/me", headers: old_headers
      expect(json[:permissions]).to include("orders.create")
      expect(json[:permissions]).not_to include("KDS")
      get "/api/v1/me", headers: auth_headers(cashier.reload)
      expect(json[:permissions]).to include("KDS", "app.kitchen")
      expect(json[:permissions]).not_to include("orders.create")
    end
  end

  describe "surface" do
    it "refuses a software-only code on a tablet-paired device and allows it on the desktop POS" do
      branch = within(owner.business) { Branch.first }
      tablet = within(owner.business) { Device.create!(branch: branch, name: "Tab", kind: "tablet", paired_at: Time.current) }
      till = within(owner.business) { Device.create!(branch: branch, name: "Till", kind: "till", paired_at: Time.current) }
      within(owner.business) { cashier.set_permissions!(%w[PRINTERS SALES_WALKIN]) }
      expect(cashier.reload.can?("PRINTERS", surface: "software")).to be true
      expect(cashier.can?("PRINTERS", surface: "app")).to be false
      expect(cashier.can?("SALES_WALKIN", surface: "app")).to be true
      expect(cashier.can?("PRINTERS")).to be true
      expect(tablet.kind).to eq("tablet")
      expect(till.kind).to eq("till")
    end
  end
end

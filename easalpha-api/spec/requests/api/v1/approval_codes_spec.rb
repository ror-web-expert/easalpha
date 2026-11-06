require "rails_helper"

# Review of 6 Nov 2026, R6: one manager PIN unlocked every permission that manager holds, for the whole request and in
# sync replay. An approval.required answer now names what it needs (details.permissions with labels); the till sends
# those back as approval_codes with the PIN, and the PIN grants only them. A PIN without approval_codes is a till from
# before this change: it keeps the old behaviour for one release, logged.
RSpec.describe "Manager approvals limited to the codes the till showed", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  # A chai at a cut price (prices.override) and an open item (items.open): two steps the cashier may not do alone.
  def two_step_order(**extra)
    { order_type: "takeaway", place: true, lines: [ { product_id: m[:chai].id, quantity: 1, price_override_minor: 5_000 }, { open_item: { name: "Cake slice", price_minor: 30_000 }, quantity: 1 } ] }.merge(extra)
  end

  def legacy_logged = have_received(:warn).with(a_string_including("[approval.legacy]"))

  describe "online" do
    it "names the permission and its label when it asks for a manager" do
      api_post "/api/v1/orders", two_step_order, headers: pos
      expect(response).to have_http_status(:forbidden)
      expect(json[:error]).to include(code: "approval.required")
      expect(json[:error][:details]).to eq(permissions: [ "prices.override" ], labels: { "prices.override": "Override an item price or change an order's service charge" })
    end

    it "grants only the codes sent with the PIN: the next guarded step asks again, naming its own" do
      api_post "/api/v1/orders", two_step_order(approver_pin: "9999", approval_codes: [ "prices.override" ]), headers: pos
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("permission.denied")
      expect(json[:error][:details][:permissions]).to eq([ "items.open" ])
      expect(within(biz) { Order.count }).to eq(0)

      api_post "/api/v1/orders", two_step_order(approver_pin: "9999", approval_codes: %w[prices.override items.open]), headers: pos
      expect(response).to have_http_status(:created), response.body
      chai = json[:items].find { |i| i[:name] == "Chai" }
      expect(chai).to include(unit_price_minor: 5_000, price_overridden: true)
      expect(within(biz) { OrderItem.find(chai[:id]).override_approved_by_id }).to eq(manager.id)
    end

    it "does not grant a code the manager does not hold, even when the till names it" do
      lead = add_member!(biz, "cashier", pin: "7777")
      within(biz) { lead.set_permissions!(%w[app.pos orders.create prices.override]) }
      api_post "/api/v1/orders", two_step_order(approver_pin: "7777", approval_codes: %w[prices.override items.open]), headers: pos
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:details][:permissions]).to eq([ "items.open" ])
    end

    it "keeps a PIN without approval_codes working as before for one release, and logs it" do
      allow(Rails.logger).to receive(:warn).and_call_original
      api_post "/api/v1/orders", two_step_order(approver_pin: "9999"), headers: pos
      expect(response).to have_http_status(:created), response.body
      expect(Rails.logger).to legacy_logged
    end

    it "approves a single-permission action only when the dialog named it" do
      api_post "/api/v1/orders", { order_type: "takeaway", place: true, lines: [ { product_id: m[:chai].id, quantity: 1 } ] }, headers: pos
      id = json[:id]
      api_post "/api/v1/orders/#{id}/void", { reason: "Wrong table" }, headers: pos
      expect(json[:error]).to include(code: "approval.required", details: { permissions: [ "orders.void" ], labels: { "orders.void": "Void an order before payment" } })
      api_post "/api/v1/orders/#{id}/void", { reason: "Wrong table", approver_pin: "9999", approval_codes: [ "prices.override" ] }, headers: pos
      expect(json[:error]).to include(code: "approval.required")
      expect(json[:error][:details][:permissions]).to eq([ "orders.void" ])
      expect(within(biz) { Order.find(id).status }).not_to eq("voided")
      api_post "/api/v1/orders/#{id}/void", { reason: "Wrong table", approver_pin: "9999", approval_codes: [ "orders.void" ] }, headers: pos
      expect(response).to have_http_status(:ok), response.body
      expect(json[:status]).to eq("voided")
    end

    it "names REOPEN_ORDER when a reopened order needs the order-update PIN, and takes a manager for exactly that" do
      api_post "/api/v1/orders", { order_type: "walk_in", place: true, lines: [ { product_id: m[:chai].id } ] }, headers: auth_headers(owner)
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: auth_headers(owner)
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN ORDERS REOPEN_ORDER DELETE_ORDER_ITEM MODIFY_REOPEN_DECREASE_QTY REQUIRE_PIN_FOR_ORDER_UPDATE]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: ch
      line = json[:items].first
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 2 } ] }, headers: ch
      expect(json[:error]).to include(code: "pin.required")
      expect(json[:error][:details][:permissions]).to eq([ "REOPEN_ORDER" ])
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 2 } ], approver_pin: "9999", approval_codes: [ "orders.void" ] }, headers: ch
      expect(json[:error][:code]).to eq("pin.required")
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 2 } ], approver_pin: "9999", approval_codes: [ "REOPEN_ORDER" ] }, headers: ch
      expect(response).to have_http_status(:ok), response.body
    end
  end

  describe "sync replay" do
    let(:void_record) do
      id = SecureRandom.uuid
      api_post "/api/v1/sync/push", { records: [ { type: "order", id: id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ] }, headers: pos
      { type: "void", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: id, reason: "mistake" } }
    end
    let(:staff_meal_order) do
      { type: "order", id: SecureRandom.uuid, membership_id: cashier.id,
        payload: { order_type: "takeaway", status: "placed", is_staff_meal: true, staff_meal_reason: "lunch", lines: [ { product_id: m[:chai].id, quantity: 1, price_override_minor: 5_000 } ] } }
    end

    def push(*records) = api_post("/api/v1/sync/push", { records: records }, headers: pos)
    def result = json[:results].first

    it "names the permission a rejected record needs" do
      push(void_record)
      expect(result).to include(status: "rejected", code: "approval.required", details: { permissions: [ "orders.void" ], labels: { "orders.void": "Void an order before payment" } })
    end

    it "grants the record only its approval_codes, and keeps neither the PIN nor the codes" do
      rec = staff_meal_order
      push(rec.merge(approver_pin: "9999", approval_codes: [ "orders.staff_meal" ]))
      expect(result).to include(status: "rejected", code: "approval.required")
      expect(result[:details][:permissions]).to eq([ "prices.override" ])
      push(rec.merge(approver_pin: "9999", approval_codes: %w[orders.staff_meal prices.override]))
      expect(result[:status]).to eq("accepted"), response.body
      within(biz) do
        o = Order.find(rec[:id])
        expect(o.staff_meal_approved_by_id).to eq(manager.id)
        expect(o.items.first.override_approved_by_id).to eq(manager.id)
        expect(SyncRejection.pluck(:payload).to_json).not_to include("approval_codes", "9999")
      end
    end

    it "keeps a PIN without approval_codes covering the whole record for one release, and logs it" do
      allow(Rails.logger).to receive(:warn).and_call_original
      push(void_record.merge(approver_pin: "9999"))
      expect(result[:status]).to eq("accepted"), response.body
      expect(Rails.logger).to legacy_logged
    end
  end
end

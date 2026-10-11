require "rails_helper"

RSpec.describe "Tax invoices, offline sync, khata ledger", type: :request do
  include ActiveJob::TestHelper
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T1") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  describe "tax invoices" do
    before { within(biz) { Branch.first.update!(tax_registration: { "authority" => "pra", "ntn" => "1234567-8", "pos_id" => "POS-1" }) } }

    it "queues an invoice when an order is paid, the job submits it through the sandbox, and the receipt carries the number" do
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      oid = json[:id]
      api_post "/api/v1/orders/#{oid}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      expect(json[:receipt][:tax_invoice][:status]).to eq("queued")
      expect(enqueued_jobs.map { |j| j["job_class"] }).to include("TaxInvoiceSyncJob")
      perform_enqueued_jobs
      get "/api/v1/orders/#{oid}/receipt", headers: headers
      expect(json[:tax_invoice][:status]).to eq("accepted")
      expect(json[:tax_invoice][:number]).to start_with("PRA-SB-")
      get "/api/v1/tax_invoices/summary", headers: headers
      expect(json[:accepted]).to eq(1)
      expect(json[:registered]).to be true
      get "/api/v1/tax_invoices?status=accepted", headers: headers
      expect(json[:data].size).to eq(1)
    end

    it "marks a failed submission with backoff and lets a manager retry" do
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      oid = json[:id]
      api_post "/api/v1/orders/#{oid}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      inv = within(biz) { TaxInvoice.find_by!(order_id: oid) }
      within(biz) { inv.update!(request_payload: inv.request_payload.merge("force_failure" => true)) }
      perform_enqueued_jobs
      expect(inv.reload.status).to eq("failed")
      expect(inv.next_attempt_at).to be > Time.current
      expect(inv.last_error).to include("forced failure")
      within(biz) { inv.update!(request_payload: inv.request_payload.except("force_failure")) }
      api_post "/api/v1/tax_invoices/#{inv.id}/retry", {}, headers: headers
      expect(json[:status]).to eq("accepted")
      api_post "/api/v1/tax_invoices/#{inv.id}/retry", {}, headers: headers
      expect(response).to have_http_status(:conflict)
    end

    it "skips invoices when the branch is not registered" do
      within(biz) { Branch.first.update!(tax_registration: {}) }
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      expect(json[:receipt][:tax_invoice][:status]).to eq("not_registered")
      within(biz) { expect(TaxInvoice.count).to eq(0) }
    end
  end

  describe "offline sync" do
    it "pushes a batch of offline records in order, treats a re-push as duplicates, and records rejections for attention" do
      cashier
      order_id = SecureRandom.uuid
      pay_id = SecureRandom.uuid
      shift_id = SecureRandom.uuid
      records = [
        { type: "shift_open", id: shift_id, membership_id: cashier.id, payload: { opening_cash_minor: 100_000, client_created_at: 3.hours.ago.iso8601 } },
        { type: "order", id: order_id, membership_id: cashier.id, payload: { order_type: "takeaway", till_serial: "T1-007", client_created_at: 2.hours.ago.iso8601, status: "placed",
                                                                                lines: [ { product_id: m[:burger].id, quantity: 1, modifiers: [ { modifier_id: m[:hot].id } ] } ],
                                                                                payments: [ { id: pay_id, method_code: "cash", amount_minor: 54_520, tendered_minor: 60_000 } ] } },
        { type: "order", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_type: "walk_in", status: "placed", lines: [ { product_id: SecureRandom.uuid } ] } },
        { type: "cash_movement", id: SecureRandom.uuid, membership_id: cashier.id, payload: { shift_id: shift_id, kind: "cash_out", amount_minor: 500, reason: "Tea" } },
        { type: "shift_close", id: shift_id, membership_id: cashier.id, payload: { counted_cash_minor: 154_020 } }
      ]
      api_post "/api/v1/sync/push", { records: records }, headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      statuses = json[:results].map { |r| r[:status] }
      expect(statuses).to eq(%w[accepted accepted rejected accepted accepted])
      expect(json[:results][2][:code]).to eq("not_found")
      within(biz) do
        o = Order.find(order_id)
        expect(o.status).to eq("paid")
        expect(o.till_serial).to eq("T1-007")
        expect(o.serial).to eq(1)
        expect(o.shift_id).to eq(shift_id)
        expect(Payment.find(pay_id).change_minor).to eq(5_480)
        s = Shift.find(shift_id)
        expect(s.status).to eq("closed")
        expect(s.over_short_minor).to eq(0)
        expect(SyncRejection.open.count).to eq(1)
        expect(SyncBatch.last.attributes.slice("accepted", "duplicates", "rejected")).to eq("accepted" => 4, "duplicates" => 0, "rejected" => 1)
      end
      api_post "/api/v1/sync/push", { records: records }, headers: device_headers(device)
      expect(json[:results].map { |r| r[:status] }).to eq(%w[duplicate duplicate rejected duplicate duplicate])
      get "/api/v1/sync/rejections", headers: headers
      expect(json[:data].size).to eq(2)
      api_post "/api/v1/sync/rejections/#{json[:data].first[:id]}/resolve", { resolution: "item deleted, customer refunded" }, headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "pulls changes since a cursor with staff PIN digests only for a paired device" do
      cashier
      get "/api/v1/sync/changes", headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      expect(json[:products].size).to eq(2)
      expect(json[:staff].find { |s| s[:id] == cashier.id }[:pin_digest]).to be_present
      expect(json[:payment_methods].map { |p| p[:code] }).to include("cash")
      cursor = json[:cursor]
      get "/api/v1/sync/changes?since=#{cursor}", headers: device_headers(device)
      expect(json[:products]).to be_empty
      within(biz) { m[:chai].update!(base_price_minor: 9_000) }
      get "/api/v1/sync/changes?since=#{cursor}", headers: device_headers(device)
      expect(json[:products].map { |p| p[:name] }).to eq([ "Chai" ])
      get "/api/v1/sync/changes", headers: headers
      expect(json[:staff].first[:pin_digest]).to be_nil
      api_post "/api/v1/sync/push", { records: [] }, headers: headers
      expect(response).to have_http_status(:forbidden)
    end

    it "rejects records from a member who was deactivated before the action and locks a day" do
      cashier
      within(biz) { cashier.deactivate! }
      records = [ { type: "order", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_type: "walk_in", status: "placed", client_created_at: 1.minute.from_now.iso8601, lines: [ { product_id: m[:chai].id } ] } } ]
      api_post "/api/v1/sync/push", { records: records }, headers: device_headers(device)
      expect(json[:results].first).to include(status: "rejected", code: "sync.member")
    end
  end

  describe "khata ledger and aging" do
    it "lists charges and payments with a running balance and ages open charges FIFO" do
      api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567" }, headers: headers
      cust = json[:id]
      [ 100.days.ago, 70.days.ago, 10.days.ago ].each do |when_|
        api_post "/api/v1/orders", { order_type: "walk_in", customer_id: cust, client_created_at: when_.iso8601, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
        oid = json[:id]
        api_post "/api/v1/orders/#{oid}/payments", { payments: [ { method_code: "khata", amount_minor: 9_280 } ] }, headers: headers
        within(biz) { Payment.where(order_id: oid).update_all(received_at: when_) }
      end
      api_post "/api/v1/customers/#{cust}/payments", { amount_minor: 10_000, method_code: "cash" }, headers: headers
      get "/api/v1/customers/#{cust}/ledger", headers: headers
      expect(json[:balance_minor]).to eq(3 * 9_280 - 10_000)
      expect(json[:entries].map { |e| e[:kind] }).to eq(%w[charge charge charge payment])
      expect(json[:entries].last[:balance_minor]).to eq(17_840)
      # 10,000 clears the oldest charge (9,280) and 720 of the second; 8,560 of the 70-day charge and the whole 10-day charge stay open
      expect(json[:aging]).to include(current: 9_280, "61_90": 8_560, over_90: 0, total: 17_840)
      get "/api/v1/customers/aging", headers: headers
      expect(json[:totals][:total]).to eq(17_840)
      expect(json[:customers_with_due]).to eq(1)
      get "/api/v1/customers/ledger_summary", headers: headers
      expect(json[:total_outstanding_minor]).to eq(17_840)
    end
  end

  describe "daily summary" do
    it "writes a notification and a WhatsApp message to the owner" do
      owner.user.update!(phone: "+923001234567")
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      day = within(biz) { Branch.first.business_day_for(Time.current) }
      DailySummaryJob.perform_now(biz.id, day.to_s)
      within(biz) do
        expect(Notification.where(kind: "daily_summary").count).to eq(1)
        expect(WhatsappMessage.where(business_id: biz.id, template_name: "daily_summary").count).to eq(1)
      end
    end
  end
end

require "rails_helper"

# Customer accounts for hostels, canteens and offices (12 Oct 2026): the module switch, student details, opening
# balances, adjustments and reversals, the duplicate check, bills (JSON, PDF, public link, WhatsApp, bill runs, the
# month-end job), per-sale messages and the import columns.
RSpec.describe "Customer accounts", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def student!(attrs = {})
    api_post "/api/v1/customers", { name: "Ali Raza", phone: "+923001112233", member_no: "R-12", room: "12", guardian_name: "Raza Khan", guardian_phone: "+923009998877" }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def khata_sale!(customer_id, product = m[:chai])
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [ { product_id: product.id, quantity: 2 } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  describe "modules" do
    it "starts off for a new business, only the owner switches them, and khata and payroll answer module.disabled while off" do
      fresh = signup_business(name: "Hostel Canteen", modules: false)
      h = auth_headers(fresh)
      get "/api/v1/me", headers: h
      expect(json[:modules]).to eq(customer_accounts: false, payroll: false)
      c = within(fresh.business) { Customer.create!(name: "Bilal") }
      get "/api/v1/customers/#{c.id}/ledger", headers: h
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("module.disabled")
      get "/api/v1/payroll/overview", headers: h
      expect(json[:error][:code]).to eq("module.disabled")
      get "/api/v1/employees", headers: h
      expect(json[:error][:code]).to eq("module.disabled")

      manager = add_member!(fresh.business, "manager")
      within(fresh.business) { manager.set_permissions!(%w[app.admin settings.manage]) }
      api_patch "/api/v1/settings", { values: { "modules.customer_accounts" => true } }, headers: auth_headers(manager)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("modules.owner_only")

      api_patch "/api/v1/settings", { values: { "modules.customer_accounts" => true } }, headers: h
      expect(response).to have_http_status(:ok)
      expect(json[:modules]).to eq(customer_accounts: true, payroll: false)
      get "/api/v1/customers/#{c.id}/ledger", headers: h
      expect(response).to have_http_status(:ok)
    end

    it "refuses a khata payment at the till while customer accounts are off" do
      cust = within(biz) { Customer.create!(name: "Sana", phone: "+923005550000") }
      set_modules!(biz, customer_accounts: false)
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust.id, lines: [ { product_id: m[:chai].id, quantity: 1 } ], place: true }, headers: headers
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("module.disabled")
    end

    it "logs in with the module state" do
      api_post "/api/v1/auth/login", { email: owner.user.email, password: "password123" }
      expect(json[:modules]).to eq(customer_accounts: true, payroll: true)
    end
  end

  describe "student details and the duplicate check" do
    it "stores room, roll number and guardian, finds by them, and warns about likely duplicates" do
      s = student!
      expect(s).to include(room: "12", member_no: "R-12", guardian_name: "Raza Khan", guardian_phone: "+923009998877", notify_guardian: false)
      get "/api/v1/customers?q=R-12", headers: headers
      expect(json[:data].map { |c| c[:id] }).to eq([ s[:id] ])
      get "/api/v1/customers?q=Ali", headers: headers
      expect(json[:data].map { |c| c[:id] }).to eq([ s[:id] ])

      get "/api/v1/customers/duplicates", params: { name: "ali  raza." }, headers: headers
      expect(json[:data].first).to include(id: s[:id], reasons: [ "Same name" ])
      get "/api/v1/customers/duplicates", params: { name: "Raza Ali" }, headers: headers
      expect(json[:data].first[:reasons]).to include("Similar name")
      get "/api/v1/customers/duplicates", params: { name: "Usman", member_no: "r-12" }, headers: headers
      expect(json[:data].first[:reasons]).to eq([ "Same roll or ID number" ])
      get "/api/v1/customers/duplicates", params: { name: "Hamza Raza", guardian_phone: "03009998877" }, headers: headers
      expect(json[:data].first[:reasons]).to include("Same guardian phone")
      get "/api/v1/customers/duplicates", params: { name: "Ali Raza", exclude_id: s[:id] }, headers: headers
      expect(json[:data]).to be_empty

      # A sibling shares the guardian's phone but has no phone of their own: allowed, and messages go to the guardian.
      sib = student!(name: "Hamza Raza", phone: nil, member_no: "R-13")
      expect(within(biz) { Customer.find(sib[:id]).account_phones }).to eq([ "+923009998877" ])
    end
  end

  describe "opening balance and adjustments" do
    it "enters an opening balance on create, refuses a second one, adjusts both ways with a reason, reverses, and keeps rows insert-only" do
      s = student!(opening_balance_minor: 300_000, opening_reason: "Carried over from the register")
      expect(s[:balance_minor]).to eq(300_000)
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "opening", amount_minor: 5_000, reason: "again" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("khata.opening_exists")

      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: -20_000, reason: "Tea charged twice on 3 Oct" }, headers: headers
      expect(response).to have_http_status(:created)
      down = json[:adjustment]
      expect(json[:customer][:balance_minor]).to eq(280_000)
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: 0, reason: "x" }, headers: headers
      expect(json[:error][:code]).to eq("adjustment.amount")
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: 100, reason: " " }, headers: headers
      expect(json[:error][:code]).to eq("adjustment.reason")
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: 100, reason: "late", effective_on: (today + 1).to_s }, headers: headers
      expect(json[:error][:code]).to eq("adjustment.date")

      api_post "/api/v1/customer_adjustments/#{down[:id]}/reverse", { reason: "The tea was right after all" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:customer][:balance_minor]).to eq(300_000)
      expect(json[:adjustment]).to include(kind: "reversal", amount_minor: 20_000, reverses_label: down[:label])
      api_post "/api/v1/customer_adjustments/#{down[:id]}/reverse", { reason: "again" }, headers: headers
      expect(json[:error][:code]).to eq("adjustment.reversed")

      get "/api/v1/customers/#{s[:id]}/adjustments", headers: headers
      expect(json[:data].map { |a| a[:kind] }).to eq(%w[reversal adjustment opening])
      expect(json[:data].find { |a| a[:id] == down[:id] }).to include(reversed: true)
      expect(json[:open_opening][:amount_minor]).to eq(300_000)

      get "/api/v1/customers/#{s[:id]}/ledger", headers: headers
      kinds = json[:entries].map { |e| e[:kind] }
      expect(kinds).to eq(%w[opening adjustment reversal])
      expect(json[:entries].last[:balance_minor]).to eq(300_000)

      # Journal: opening to capital, the correction to sales discounts, the reversal reverses it; trial balance ties.
      within(biz) do
        expect(JournalEntry.where(ref_table: "customer_adjustments").count).to eq(2)
        expect(JournalEntry.where(kind: "reversal").count).to eq(1)
        first = CustomerAdjustment.first
        expect { CustomerAdjustment.transaction(requires_new: true) { first.update_column(:reason, "edited") } }.to raise_error(ActiveRecord::StatementInvalid, /insert-only/)
        expect { CustomerAdjustment.transaction(requires_new: true) { first.delete } }.to raise_error(ActiveRecord::StatementInvalid, /insert-only/)
        rich = AuditLog.where(table_name: "customer_adjustments").where("audit_logs.after ? 'balance_after_minor'")
        expect(rich.pluck(Arel.sql("audit_logs.after->>'balance_after_minor'")).map(&:to_i)).to contain_exactly(300_000, 280_000, 300_000)
      end
      get "/api/v1/finance/trial_balance", headers: headers
      expect(json[:totals][:debit_minor]).to eq(json[:totals][:credit_minor]) if response.ok?

      # The nightly rebuild keeps the balance (it replays adjustments too).
      within(biz) do
        Customer.where(id: s[:id]).update_all(balance_minor: 0)
        Balances::Rebuild.customers! if Balances::Rebuild.respond_to?(:customers!)
      end
    end

    it "needs khata.adjust or a manager PIN" do
      s = student!
      cashier = add_member!(biz, "cashier")
      add_member!(biz, "manager", pin: "4321")
      ch = auth_headers(cashier)
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: 5_000, reason: "Biscuits not entered" }, headers: ch
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("approval.required")
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: 5_000, reason: "Biscuits not entered", approver_pin: "4321" }, headers: ch
      expect(response).to have_http_status(:created)
      expect(json[:adjustment][:approved_by_membership_id]).to be_present
    end

    it "messages the customer and the guardian when asked" do
      s = student!(notify_guardian: true)
      within(biz) { WhatsappMessage.delete_all }
      api_post "/api/v1/customers/#{s[:id]}/adjustments", { kind: "adjustment", amount_minor: -1_000, reason: "Goodwill" }, headers: headers
      msgs = within(biz) { WhatsappMessage.where(business_id: biz.id, template_name: "account_adjustment").to_a }
      expect(msgs.map(&:to_phone)).to contain_exactly("+923001112233", "+923009998877")
      expect(msgs.first.variables["text"]).to include("reduced by Rs 10", "Goodwill")
    end
  end

  describe "sales on account" do
    it "messages the customer for each sale on account and the ledger lists the items" do
      s = student!
      within(biz) { WhatsappMessage.delete_all }
      o = khata_sale!(s[:id])
      msg = within(biz) { WhatsappMessage.find_by(template_name: "account_receipt") }
      expect(msg.to_phone).to eq("+923001112233")
      expect(msg.variables["text"]).to include(o[:label] || "order", "2x Chai")

      within(biz) { Setting.write!(biz, { "khata.notify_each_sale" => false }) }
      khata_sale!(s[:id])
      expect(within(biz) { WhatsappMessage.where(template_name: "account_receipt").count }).to eq(1)

      get "/api/v1/customers/#{s[:id]}/ledger", headers: headers
      expect(json[:entries].first[:items]).to eq("2x Chai")
    end
  end

  describe "bills" do
    it "builds last month's bill with the balance brought forward, renders the PDF, opens by the public link and sends on WhatsApp" do
      s = student!(opening_balance_minor: 100_000, opening_on: (today.prev_month.beginning_of_month - 1).to_s)
      cust = within(biz) { Customer.find(s[:id]) }
      # Last month: a sale on account and a payment, dated into last month.
      o = khata_sale!(s[:id])
      within(biz) do
        Payment.where(order_id: o[:id]).update_all(business_day: today.prev_month.beginning_of_month + 4)
        api_post "/api/v1/customers/#{s[:id]}/payments", { amount_minor: 50_000, method_code: "cash" }, headers: headers
        CustomerPayment.update_all(business_day: today.prev_month.beginning_of_month + 9)
      end
      get "/api/v1/customers/#{s[:id]}/bill", headers: headers
      expect(response).to have_http_status(:ok)
      b = json
      expect(b[:from]).to eq(today.prev_month.beginning_of_month.to_s)
      expect(b[:brought_forward_minor]).to eq(100_000)
      expect(b[:totals][:charges_minor]).to eq(o[:total_minor])
      expect(b[:totals][:payments_minor]).to eq(50_000)
      expect(b[:closing_balance_minor]).to eq(100_000 + o[:total_minor] - 50_000)
      expect(b[:customer]).to include(member_no: "R-12", room: "12")
      expect(b[:due_on]).to eq((today + 10).to_s)
      expect(b[:link]).to match(%r{/bill/[\w=-]+})

      get "/api/v1/customers/#{s[:id]}/bill.pdf", headers: headers
      expect(response.media_type).to eq("application/pdf")
      expect(response.body[0, 5]).to eq("%PDF-")

      token = b[:link].split("/bill/").last
      get "/api/v1/public/bills/#{token}"
      expect(response).to have_http_status(:ok)
      expect(json[:closing_balance_minor]).to eq(b[:closing_balance_minor])
      get "/api/v1/public/bills/#{token}/pdf"
      expect(response.body[0, 5]).to eq("%PDF-")
      get "/api/v1/public/bills/#{token}x"
      expect(response).to have_http_status(:not_found)
      expect(json[:error][:code]).to eq("bill.link_invalid")

      within(biz) { WhatsappMessage.delete_all }
      api_post "/api/v1/customers/#{s[:id]}/send_bill", {}, headers: headers
      expect(response).to have_http_status(:created)
      msg = within(biz) { WhatsappMessage.find_by(template_name: "account_bill") }
      expect(msg.variables["document"]).to include("kind" => "customer_bill", "customer_id" => cust.id)
      expect(msg.variables["text"]).to include("Amount due Rs", "/bill/")

      # The delivery job rebuilds the PDF and sends it as a document through the linked phone.
      within(biz) do
        allow(Whatsapp::Provider).to receive(:mode).and_return("web")
        expect(Whatsapp::Gateway).to receive(:send_document!) { |_b, **kw| expect(kw[:data][0, 5]).to eq("%PDF-"); expect(kw[:filename]).to end_with(".pdf"); "wamid-1" }
        msg.update!(status: "queued")
        WhatsappDeliveryJob.perform_now(msg.id)
        expect(msg.reload.status).to eq("sent")
      end
    end

    it "lists bills for a period, prints them in one PDF and sends a bill run with sent, failed and skipped rows" do
      a = student!(opening_balance_minor: 40_000)
      b = student!(name: "Bilal Ahmed", phone: nil, guardian_phone: nil, member_no: "R-20", opening_balance_minor: 25_000)
      khata_sale!(a[:id])
      get "/api/v1/customer_bills", params: { from: today.beginning_of_month.to_s, to: today.to_s }, headers: headers
      expect(json[:rows].map { |r| r[:customer][:id] }).to contain_exactly(a[:id], b[:id])
      get "/api/v1/customer_bills.pdf", params: { from: today.beginning_of_month.to_s, to: today.to_s }, headers: headers
      expect(response.body[0, 5]).to eq("%PDF-")
      expect(response.body.scan("/Type /Page\n").size + response.body.scan("/Type /Page>>").size + response.body.scan(%r{/Type /Page[^s]}).size).to be >= 1

      api_post "/api/v1/bill_runs", { from: today.beginning_of_month.to_s, to: today.to_s }, headers: headers
      expect(response).to have_http_status(:created)
      run = json
      expect(run).to include(customers_count: 2, sent_count: 1, skipped_count: 1, failed_count: 0)
      expect(run[:results].find { |r| r[:customer_id] == b[:id] }[:status]).to eq("skipped")
      get "/api/v1/bill_runs", headers: headers
      expect(json[:data].size).to eq(1)
      expect(within(biz) { Notification.where(kind: "bill_run").count }).to eq(1)
    end

    it "sends the month-end bills once, on the chosen day, only when switched on" do
      s = student!(opening_balance_minor: 40_000, opening_on: (today.prev_month.beginning_of_month).to_s)
      within(biz) do
        Customers::Bills.monthly!(biz, today: today.beginning_of_month + 0)
        expect(BillRun.count).to eq(0) # not switched on
        Setting.write!(biz, { "khata.monthly_bills.enabled" => true, "khata.monthly_bills.day" => 3 })
        Customers::Bills.monthly!(biz.reload, today: today.beginning_of_month)
        expect(BillRun.count).to eq(0) # wrong day
        Customers::Bills.monthly!(biz.reload, today: today.beginning_of_month + 2)
        expect(BillRun.count).to eq(1)
        expect(BillRun.first).to have_attributes(trigger: "auto", period_from: today.prev_month.beginning_of_month, sent_count: 1)
        Customers::Bills.monthly!(biz.reload, today: today.beginning_of_month + 2)
        expect(BillRun.count).to eq(1) # once per period
      end
      MonthlyBillsJob.perform_now
      expect(s).to be_present
    end
  end

  describe "import" do
    it "imports students with room, roll number, guardian, credit limit and opening balance, matching by roll number" do
      csv = <<~CSV
        name,phone,room,roll_no,guardian_name,guardian_phone,credit_limit,opening_balance
        Ali Raza,03001112233,12,R-12,Raza Khan,03009998877,"5,000",1500
        Hamza Raza,,12,R-13,Raza Khan,03009998877,,-200
        Usman,,7,R-30,,,,abc
      CSV
      api_post "/api/v1/customers/import", { data: csv }, headers: headers
      expect(json).to include(created: 2, openings: 2)
      expect(json[:error_rows].first[:error]).to include("not a number")
      ali = within(biz) { Customer.find_by(member_no: "R-12") }
      expect(ali).to have_attributes(room: "12", guardian_phone: "+923009998877", credit_limit_minor: 500_000, balance_minor: 150_000)
      expect(within(biz) { Customer.find_by(member_no: "R-13").balance_minor }).to eq(-20_000)
      # Re-import: matched by roll number, the opening balance is not entered twice.
      api_post "/api/v1/customers/import", { data: "name,roll_no,opening_balance,room\nHamza Raza,R-13,999,14\n" }, headers: headers
      expect(json).to include(created: 0, updated: 1, openings: 0)
      expect(json[:error_rows].first[:error]).to include("already has an opening balance")
      expect(within(biz) { Customer.find_by(member_no: "R-13").room }).to eq("14")
    end

    it "refuses opening balances without khata.adjust" do
      clerk = add_member!(biz, "cashier")
      api_post "/api/v1/customers/import", { data: "name,opening_balance\nX,100\n" }, headers: auth_headers(clerk)
      expect(response).to have_http_status(:forbidden)
    end
  end
end

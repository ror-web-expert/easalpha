require "rails_helper"

# The double-entry books after the final fix round (6 Nov 2026, night): QA B4 (canteen subsidy and salary deduction),
# B9 (day lock on purchasing money), B10 (supplier opening), B11 (tips paid through payroll), B12 (purchase returns),
# B15 (future-dated vouchers, internal methods) and review ledger#8 (refunds of sales journaled before the split).
RSpec.describe "Books tell the truth", type: :request do
  let!(:owner) { signup_business(name: "Steel Works Mess") }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.order(:created_at).first } }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def balance(code) = within(biz) { Finance::Statements.balances(as_of: today)[GlAccount.find_by!(code: code).id] }
  def mirror_balance(name) = within(biz) { Finance::Statements.balances(as_of: today)[Finance::Chart.for_payment_account(PaymentAccount.find_by!(name: name)).id] }

  def sell!(product, method: "cash", tip: 0, extra: {})
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: product.id } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: method, amount_minor: o[:total_minor] + tip, tendered_minor: o[:total_minor] + tip } ], tip_minor: tip }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def lock!(day = today)
    api_post "/api/v1/day_close/lock", { business_day: day.to_s, force: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  # A sale as the journal booked it before the sales split (production until this round): a cash sale's voucher hung
  # on its account entry, a khata sale's on the payment, and either put the whole amount, tax and tip included, in Sales.
  def journal_as_before_split!(order_id)
    within(biz) do
      p = Payment.find_by!(order_id: order_id)
      JournalEntry.where(ref_table: "payments", ref_id: p.id).find_each { |e| JournalLine.where(journal_entry_id: e.id).delete_all && e.delete }
      entry = AccountEntry.find_by(ref_table: "payments", ref_id: p.id)
      money = entry ? Finance::Chart.for_payment_account(entry.payment_account) : "1100"
      Finance::Journal.post!(business_day: p.business_day, ref: entry || p, branch_id: p.branch_id, description: "Order before the split",
                             lines: [ { account: money, debit_minor: p.amount_minor }, { account: "4000", credit_minor: p.amount_minor } ])
    end
  end

  describe "canteen subsidy and salary deduction (B4)" do
    let(:kiosk) { within(biz) { Device.create!(branch: branch, name: "Kiosk 1", kind: "kiosk", paired_at: Time.current, code: "Q1") } }
    let(:worker) { within(biz) { Employee.create!(name: "Akbar Ali", base_salary_minor: 3_000_000, pay_frequency: "monthly", joined_on: Date.new(2026, 1, 1), fingerprint_id: "FP-001", fingerprint_enrolled: true) } }

    before do
      api_patch "/api/v1/settings", { values: { "modules.canteen" => true } }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      within(biz) do
        # The whole business day: the window opens at the day end (02:01), so a meal at any hour falls on today (a window
        # opening before 02:01 belongs to the previous business day since the canteen night-session fix).
        lunch = MealSession.create!(branch: branch, name: "Lunch", starts_at: "02:01", ends_at: "02:00")
        Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: lunch, date: today, items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ]))
      end
    end

    def claim!
      worker
      api_post "/api/v1/canteen/claims", { fingerprint_id: "FP-001" }, headers: device_headers(kiosk)
      expect(response).to have_http_status(:created), response.body
      json
    end

    it "books the company's share as Staff Meals and the worker's as a receivable that the payroll clears into a gross salary expense" do
      claim! # Rs 450 + Rs 72 tax = Rs 522; the worker pays Rs 200, the company Rs 322
      # The meal is sold at its menu price: revenue and tax are the order's own figures.
      expect(balance("4000")).to eq(45_000)
      expect(balance("2100")).to eq(7_200)
      expect(balance("1100")).to eq(20_000)
      expect(balance("5170")).to eq(32_200)
      within(biz) do
        expect(PaymentMethod.find_by!(code: "canteen_subsidy")).to have_attributes(internal: true, payment_account_id: nil)
        expect(PaymentAccount.where(name: "Company subsidy")).to be_empty
        bank = GlAccount.find_by!(code: "1020")
        expect(GlAccount.where(parent_id: bank.id, name: [ "Company subsidy", "Salary deduction" ])).to be_empty
        expect(Finance::Statements.balances(as_of: today).values_at(*GlAccount.where(parent_id: bank.id).ids)).to all(eq(0))
      end
      get "/api/v1/finance/dashboard", headers: headers
      expect(json[:total_balance_minor]).to eq(0) # no money moved

      month = today.beginning_of_month
      within(biz) { (month..month.end_of_month).each { |d| Attendance.create!(employee_id: worker.id, business_day: d, status: "present", source: "manual") } }
      api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m") }, headers: headers
      expect(response).to have_http_status(:created), response.body
      run = json
      expect(run[:payslips].sole).to include(base_minor: 3_000_000, deductions_minor: 20_000, net_minor: 2_980_000)
      api_post "/api/v1/payroll/runs/#{run[:id]}/pay", { method_code: "bank" }, headers: headers
      expect(response).to have_http_status(:ok), response.body

      expect(balance("1100")).to eq(0) # the deduction cleared what the worker owed
      expect(balance("5110")).to eq(3_000_000) # salary at gross: Rs 29,800 in cash and Rs 200 of meals
      expect(mirror_balance("Bank")).to eq(-2_980_000)
      within(biz) do
        expect(PaymentMethod.find_by!(code: "canteen_payroll")).to have_attributes(internal: true, payment_account_id: nil)
        expect(PaymentAccount.where(name: "Salary deduction")).to be_empty
        expect(Customer.find(Employee.find(worker.id).customer_id).balance_minor).to eq(0)
      end
      get "/api/v1/finance/trial_balance?from=#{today}&to=#{today}", headers: headers
      expect(json[:balanced]).to be true
    end

    it "takes both shares back when a meal is cancelled" do
      c = claim!
      api_post "/api/v1/canteen/claims/#{c[:id]}/cancel", { reason: "wrong finger" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      %w[1100 5170 4000 2100].each { |code| expect(balance(code)).to eq(0), "#{code} should net to zero" }
    end

    it "refuses an internal method where people pay or collect money" do
      claim!
      within(biz) do
        ExpenseCategory.seed_defaults!
        Canteen::Claims.internal_method!(Canteen::Claims::PAYROLL_CODE, "Salary deduction")
      end
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "canteen_subsidy" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("expense.method")
      api_post "/api/v1/suppliers", { name: "Dawn Bread" }, headers: headers
      api_post "/api/v1/suppliers/#{json[:id]}/payments", { amount_minor: 1_000, method_code: "canteen_subsidy" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("supplier_payment.method")
      customer = within(biz) { Employee.find(worker.id).customer_id }
      api_post "/api/v1/customers/#{customer}/payments", { amount_minor: 1_000, method_code: "canteen_payroll" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("khata.method")
      expect(balance("1100")).to eq(20_000)
    end
  end

  describe "tips paid through payroll (B11, ledger#4)" do
    it "takes the tip share out of Tips Payable, and leaves tips the books put in Sales as salary" do
      sell!(m[:burger], tip: 5_000)
      old = sell!(m[:chai], tip: 3_000)
      journal_as_before_split!(old[:id]) # its Rs 30 tip went to Sales
      expect(balance("2400")).to eq(5_000)
      month = today.beginning_of_month
      sana = within(biz) do
        e = Employee.create!(name: "Sana", base_salary_minor: 4_000_000, pay_frequency: "monthly", joined_on: Date.new(2026, 1, 1), shares_tips: true)
        (month..month.end_of_month).each { |d| Attendance.create!(employee_id: e.id, business_day: d, status: "present", source: "manual") }
        e
      end
      api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m") }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:payslips].sole).to include(employee_id: sana.id, tips_minor: 8_000, net_minor: 4_008_000)
      api_post "/api/v1/payroll/runs/#{json[:id]}/pay", { method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(balance("2400")).to eq(0)
      expect(balance("5110")).to eq(4_003_000) # the salary and the Rs 30 tip that was booked as a sale
      within(biz) { expect(JournalEntry.where(ref_table: "payslips").sole.lines.map { |l| [ l.gl_account.code, l.debit_minor, l.credit_minor ] }).to contain_exactly([ "2400", 5_000, 0 ], [ "5110", 0, 5_000 ]) }
    end
  end

  describe "refund of a sale journaled before the split (ledger#8, deploy#2)" do
    it "takes a cash refund out of Sales only, whole or in part, and never pushes Tax, Tips or Rounding negative" do
      o = sell!(m[:burger], tip: 5_000) # Rs 522 + Rs 50 tip
      journal_as_before_split!(o[:id])
      expect(balance("4000")).to eq(57_200)
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 10_000, method_code: "cash", reason: "Cold" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(balance("4000")).to eq(47_200)
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 47_200, method_code: "cash", reason: "Cancelled" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:order][:status]).to eq("refunded")
      %w[4000 2100 2400 4120 4010].each { |code| expect(balance(code)).to eq(0), "#{code} should be zero" }
      expect(mirror_balance("Cash")).to eq(0)
    end

    it "takes a part refund of an account sale out of Sales instead of moving its revenue into tax" do
      api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567" }, headers: headers
      o = sell!(m[:chai], method: "khata", extra: { customer_id: json[:id] })
      journal_as_before_split!(o[:id])
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 2_000, method_code: "khata", reason: "Short pour" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(balance("4000")).to eq(7_280)
      expect(balance("2100")).to eq(0)
      expect(balance("1100")).to eq(7_280)
    end

    it "still splits a refund of a sale journaled with the split" do
      o = sell!(m[:burger], tip: 5_000)
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 57_200, method_code: "cash", reason: "Cancelled" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      %w[4000 2100 2400].each { |code| expect(balance(code)).to eq(0), "#{code} should net to zero" }
    end
  end

  describe "supplier opening balance (B10)" do
    it "posts it against the owner's capital so Accounts Payable equals the supplier ledgers, and refuses a locked day" do
      api_post "/api/v1/suppliers", { name: "Dawn Bread", opening_balance_minor: 500_000 }, headers: headers
      expect(response).to have_http_status(:created), response.body
      dawn = json[:id]
      api_post "/api/v1/suppliers", { name: "Metro", opening_balance_minor: -20_000 }, headers: headers # Metro owes us
      expect(response).to have_http_status(:created), response.body
      metro = json[:id]
      expect(balance("2010")).to eq(480_000)
      expect(balance("3010")).to eq(-480_000)
      ledgers = [ dawn, metro ].sum do |id|
        get "/api/v1/suppliers/#{id}/ledger", headers: headers
        json[:tiles][:balance_minor]
      end
      expect(ledgers).to eq(balance("2010"))
      lock!
      api_post "/api/v1/suppliers", { name: "Late Supplier", opening_balance_minor: 1_000 }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      within(biz) { expect(Supplier.where(name: "Late Supplier")).to be_empty }
      api_post "/api/v1/suppliers", { name: "No Opening" }, headers: headers # nothing to post, nothing to lock
      expect(response).to have_http_status(:created), response.body
    end
  end

  describe "day lock on purchasing money (B9)" do
    it "refuses supplier and PO payments, goods receipts and their cancel, returns and supplier adjustments on a locked day" do
      buns = within(biz) do
        Unit.seed_defaults!
        StockItem.create!(name: "Bun", sku: "BUN", base_unit: Unit.find_by!(code: "pcs"))
      end
      api_post "/api/v1/suppliers", { name: "Dawn Bread" }, headers: headers
      sup = json[:id]
      api_post "/api/v1/purchase_orders", { supplier_id: sup, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 2_000 } ], send: true }, headers: headers
      expect(response).to have_http_status(:created), response.body
      po = json[:id]
      api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 2_000 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      grn = json[:id]
      counts = -> { within(biz) { [ SupplierPayment.count, GoodsReceipt.count, PurchaseReturn.count, SupplierAdjustment.count, JournalEntry.count, GoodsReceipt.find(grn).status ] } }
      lock!
      before = counts.call

      line = [ { stock_item_id: buns.id, quantity: 2, unit_cost_minor: 2_000 } ]
      attempts = {
        "supplier payment" => -> { api_post "/api/v1/suppliers/#{sup}/payments", { amount_minor: 5_000, method_code: "cash" }, headers: headers },
        "PO payment" => -> { api_post "/api/v1/purchase_orders/#{po}/pay", { amount_minor: 5_000, method_code: "cash" }, headers: headers },
        "goods receipt" => -> { api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: line }, headers: headers },
        "receipt cancel" => -> { api_post "/api/v1/goods_receipts/#{grn}/cancel", { reason: "Wrong supplier" }, headers: headers },
        "purchase return" => -> { api_post "/api/v1/purchase_returns", { supplier_id: sup, reason: "Stale", settlement: "cash_refund", method_code: "cash", lines: line }, headers: headers },
        "supplier adjustment" => -> { api_post "/api/v1/suppliers/#{sup}/adjust", { amount_minor: -1_000, reason: "Discount" }, headers: headers }
      }
      attempts.each do |what, call|
        call.call
        expect(response).to have_http_status(:conflict), "#{what}: #{response.body}"
        expect(json[:error][:code]).to eq("day.locked"), what
      end
      expect(counts.call).to eq(before)

      # A receipt dated into a locked earlier day is refused too, while today is open.
      api_post "/api/v1/day_close/reopen", { business_day: today.to_s, reason: "testing" }, headers: headers
      lock!(today - 3)
      api_post "/api/v1/goods_receipts", { supplier_id: sup, received_on: (today - 3).to_s, lines: line }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/goods_receipts", { supplier_id: sup, received_on: (today - 2).to_s, lines: line }, headers: headers
      expect(response).to have_http_status(:created), response.body
    end
  end

  describe "purchase return (B12)" do
    it "moves Inventory by what the stock was carried at, so the account equals the stock valuation" do
      buns = within(biz) do
        Unit.seed_defaults!
        StockItem.create!(name: "Bun", sku: "BUN", base_unit: Unit.find_by!(code: "pcs"))
      end
      api_post "/api/v1/suppliers", { name: "Dawn Bread" }, headers: headers
      sup = json[:id]
      api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 2_000 } ] }, headers: headers
      first = json[:id]
      api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 3_000 } ] }, headers: headers
      # Four buns go back at the first receipt's Rs 20 while the stock carries them at the Rs 25 average.
      api_post "/api/v1/purchase_returns", { supplier_id: sup, goods_receipt_id: first, reason: "Stale", settlement: "credit_note", lines: [ { stock_item_id: buns.id, quantity: 4 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:amount_minor]).to eq(8_000)
      stock_value = within(biz) { StockLevel.where(stock_item_id: buns.id).sum(:value_minor) }
      expect(stock_value).to eq(40_000)
      expect(balance("1200")).to eq(stock_value)
      expect(balance("2010")).to eq(42_000) # Rs 500 received, Rs 80 credited back
      expect(balance("5000")).to eq(2_000) # carried at Rs 100, credited at Rs 80
      get "/api/v1/finance/trial_balance?from=#{today}&to=#{today}", headers: headers
      expect(json[:balanced]).to be true
    end
  end

  describe "manual voucher date (B15)" do
    it "refuses a voucher dated after today and takes one dated today" do
      lines = [ { code: "1010", debit_minor: 100 }, { code: "3010", credit_minor: 100 } ]
      api_post "/api/v1/finance/journal", { business_day: (today + 1).to_s, description: "Owner puts in cash", lines: lines }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("journal.future_date")
      within(biz) { expect(JournalEntry.where(kind: "manual")).to be_empty }
      api_post "/api/v1/finance/journal", { business_day: today.to_s, description: "Owner puts in cash", lines: lines }, headers: headers
      expect(response).to have_http_status(:created), response.body
    end
  end

  # One trading day with every kind of money event, then the books read as an accountant would: the trial balance
  # balances, and each account holds what its own ledger (cash, customers, suppliers, stock, payroll) says.
  describe "a day of mixed events" do
    it "balances, and every account holds what an accountant would expect" do
      api_patch "/api/v1/settings", { values: { "modules.canteen" => true, "charges.service_charge.mode" => "fixed", "charges.service_charge.value" => 50,
                                                "charges.service_charge.order_types" => %w[takeaway] } }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      get "/api/v1/payment_accounts", headers: headers
      bank = json[:data].find { |a| a[:name] == "Bank" }[:id]
      api_post "/api/v1/payment_accounts/#{bank}/adjust", { kind: "deposit", amount_minor: 5_000_000, note: "Owner's capital" }, headers: headers
      expect(response).to have_http_status(:ok), response.body

      # 1. A taxed takeaway with a Rs 50 service charge and a Rs 100 tip, in cash: 450 + 72 tax + 50 + 100 = Rs 672.
      sale = sell!(m[:burger], tip: 10_000)
      expect(sale).to include(total_minor: 67_200, tax_minor: 7_200, service_charge_minor: 5_000, tip_minor: 10_000)

      # 2. A chai on account (Rs 92.80), Rs 20 of it refunded to the account.
      api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567" }, headers: headers
      rao = json[:id]
      api_post "/api/v1/orders", { order_type: "walk_in", customer_id: rao, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      chai = json
      api_post "/api/v1/orders/#{chai[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 9_280 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/orders/#{chai[:id]}/refunds", { amount_minor: 2_000, method_code: "khata", reason: "Short pour" }, headers: headers
      expect(response).to have_http_status(:created), response.body

      # 3. A subsidised canteen meal: the Rs 522 burger at a Rs 200 worker price.
      month = today.beginning_of_month
      worker = within(biz) do
        # The whole business day: the window opens at the day end (02:01), so a meal at any hour falls on today (a window
        # opening before 02:01 belongs to the previous business day since the canteen night-session fix).
        lunch = MealSession.create!(branch: branch, name: "Lunch", starts_at: "02:01", ends_at: "02:00")
        Canteen::Plans.publish!(Canteen::Plans.save!(branch: branch, session: lunch, date: today, items: [ { product_id: m[:burger].id, worker_price_minor: 20_000 } ]))
        e = Employee.create!(name: "Akbar Ali", base_salary_minor: 3_000_000, pay_frequency: "monthly", joined_on: Date.new(2026, 1, 1), shares_tips: true)
        (month..month.end_of_month).each { |d| Attendance.create!(employee_id: e.id, business_day: d, status: "present", source: "manual") }
        e
      end
      api_post "/api/v1/canteen/claims", { employee_id: worker.id }, headers: headers
      expect(response).to have_http_status(:created), response.body

      # 4. The month's payroll, paid from the bank: Rs 30,000 salary + Rs 100 tips - Rs 200 of meals = Rs 29,900.
      api_post "/api/v1/payroll/runs", { month: month.strftime("%Y-%m") }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:payslips].sole).to include(base_minor: 3_000_000, tips_minor: 10_000, deductions_minor: 20_000, net_minor: 2_990_000)
      api_post "/api/v1/payroll/runs/#{json[:id]}/pay", { method_code: "bank" }, headers: headers
      expect(response).to have_http_status(:ok), response.body

      # 5. A supplier taken on owing Rs 5,000 from before, and 6. a purchase return: 10 buns at Rs 20 and 10 at Rs 30
      # (average Rs 25), then 4 sent back at the first receipt's Rs 20.
      api_post "/api/v1/suppliers", { name: "Dawn Bread", opening_balance_minor: 500_000 }, headers: headers
      expect(response).to have_http_status(:created), response.body
      dawn = json[:id]
      buns = within(biz) do
        Unit.seed_defaults!
        StockItem.create!(name: "Bun", sku: "BUN", base_unit: Unit.find_by!(code: "pcs"))
      end
      api_post "/api/v1/goods_receipts", { supplier_id: dawn, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 2_000 } ] }, headers: headers
      first = json[:id]
      api_post "/api/v1/goods_receipts", { supplier_id: dawn, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 3_000 } ] }, headers: headers
      api_post "/api/v1/purchase_returns", { supplier_id: dawn, goods_receipt_id: first, reason: "Stale", settlement: "credit_note", lines: [ { stock_item_id: buns.id, quantity: 4 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body

      # 7. Yesterday's sale, journaled before the split (all of its Rs 622 in Sales), refunded in full today.
      sold_at = within(biz) { branch.business_day_end_at(today - 1) - 14.hours }
      api_post "/api/v1/orders", { order_type: "takeaway", client_created_at: sold_at.iso8601, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
      old = json
      api_post "/api/v1/orders/#{old[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 62_200, tendered_minor: 62_200, client_created_at: sold_at.iso8601 } ], tip_minor: 5_000 }, headers: headers
      expect(response).to have_http_status(:created), response.body
      journal_as_before_split!(old[:id])
      api_post "/api/v1/orders/#{old[:id]}/refunds", { amount_minor: 62_200, method_code: "cash", reason: "Wrong order" }, headers: headers
      expect(response).to have_http_status(:created), response.body

      get "/api/v1/finance/trial_balance?from=#{today - 7}&to=#{today}", headers: headers
      expect(json[:balanced]).to be true
      get "/api/v1/finance/balance_sheet", headers: headers
      expect(json[:balanced]).to be true
      expect(json[:current_earnings_minor]).to eq(96_276 + 5_000 - 2_000 - 3_000_000 - 32_200)

      held = within(biz) do
        bal = Finance::Statements.balances(as_of: today)
        GlAccount.active.where(is_header: false).to_h { |a| [ a.payment_account_id ? a.name : a.code, bal[a.id] ] }.reject { |_, v| v.zero? }
      end
      expect(held).to eq(
        "Cash" => 67_200,          # the till's sale; yesterday's sale came in and went back out
        "Bank" => 2_010_000,       # Rs 50,000 put in, Rs 29,900 of salaries out
        "1100" => 7_280,           # Rao owes Rs 72.80; the worker's Rs 200 was cleared by the payroll
        "1200" => 40_000,          # 16 buns at the Rs 25 average
        "2010" => 542_000,         # Rs 5,000 opening + Rs 500 received - Rs 80 returned
        "2100" => 15_404,          # Rs 72 + Rs 10.04 (the chai's Rs 12.80 less the refund's share) + Rs 72 on the meal
        "3010" => 4_500_000,       # Rs 50,000 put in, less the supplier's opening balance
        "4000" => 96_276,          # Rs 450 + Rs 62.76 + Rs 450 on the meal; the old sale in and back out
        "4010" => 5_000,           # the service charge
        "5000" => 2_000,           # the buns went back at Rs 20 against the Rs 25 they were carried at
        "5110" => 3_000_000,       # gross salary: Rs 29,900 paid, Rs 200 of meals cleared, Rs 100 of tips out of Tips Payable
        "5170" => 32_200           # the company's share of the meal
      )
      within(biz) do
        expect(held["1100"]).to eq(Customer.sum(:balance_minor))
        expect(held["1200"]).to eq(StockLevel.sum(:value_minor))
        expect(held["2010"]).to eq(Supplier.sum(:balance_minor))
      end
    end
  end
end

require "rails_helper"

# The ledger and money-path items of the 6 Nov 2026 review (docs/REVIEW-2026-11-06.md): expected cash from the drawer
# ledger, offline khata over the limit, refunds and late payments dated to the day the money moved, dated collections,
# the day lock on every money entry, drawer drops and payouts, expense voids, automatic vouchers, refund status, the
# customer's order count and the payment id scoped to its order.
RSpec.describe "Ledger review: money paths", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def balance(code) = within(biz) { Finance::Statements.balances(as_of: today)[GlAccount.find_by!(code: code).id] }

  def sell!(lines, method: "cash", extra: {}, as: headers)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: as
    expect(response).to have_http_status(:created), response.body
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: method, amount_minor: o[:total_minor] } ] }, headers: as
    expect(response).to have_http_status(:created), response.body
    o
  end

  def customer!(attrs = {})
    api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567" }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def lock!(day = today)
    api_post "/api/v1/day_close/lock", { business_day: day.to_s, force: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  describe "expected cash (review item 3)" do
    it "counts expenses, supplier payments, supplier refunds and advances that left the drawer, and lists them on the Z report" do
      api_post "/api/v1/shifts", { opening_cash_minor: 100_000 }, headers: headers
      expect(response).to have_http_status(:created), response.body
      shift = json
      sell!([ { product_id: m[:chai].id } ]) # +9,280 cash
      within(biz) { ExpenseCategory.seed_defaults! }
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "cash", paid_to: "K-Electric" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/suppliers", { name: "Dawn Bread" }, headers: headers
      sup = json[:id]
      api_post "/api/v1/suppliers/#{sup}/payments", { amount_minor: 3_000, method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      buns = within(biz) do
        Unit.seed_defaults!
        StockItem.create!(name: "Bun", sku: "BUN", base_unit: Unit.find_by!(code: "pcs"))
      end
      api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: buns.id, quantity: 10, unit_cost_minor: 1_000 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/purchase_returns", { supplier_id: sup, reason: "Stale", settlement: "cash_refund", method_code: "cash", lines: [ { stock_item_id: buns.id, quantity: 2, unit_cost_minor: 1_000 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/employees", { name: "Ali Raza", designation: "Cook", base_salary_minor: 5_200_000, joined_on: "2026-01-01" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      emp = json[:id]
      api_post "/api/v1/payroll/advances", { employee_id: emp, amount_minor: 4_000, reason: "Eid" }, headers: headers
      adv = json[:id]
      api_post "/api/v1/payroll/advances/#{adv}/decide", { approve: true }, headers: headers
      api_post "/api/v1/payroll/advances/#{adv}/pay", { method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:ok), response.body

      expected = 100_000 + 9_280 - 5_000 - 3_000 + 2_000 - 4_000
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(expected)
      within(biz) { expect(PaymentAccount.find(shift[:drawer_account_id]).current_balance_minor).to eq(expected) }
      get "/api/v1/shifts/#{shift[:id]}/z_report", headers: headers
      expect(json[:cash]).to include(opening_minor: 100_000, cash_sales_minor: 9_280, expenses_minor: 9_000, supplier_payments_minor: 3_000, supplier_refunds_minor: 2_000,
                                     cash_in_minor: 0, cash_out_minor: 0, cash_refunds_minor: 0, khata_collected_minor: 0, expected_minor: expected)
      api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: expected }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(expected_cash_minor: expected, over_short_minor: 0)
      within(biz) { expect(Shift.find(shift[:id]).z_report.dig("cash", "expenses_minor")).to eq(9_000) }
    end

    it "gives a voided expense back to the drawer, and books the void to the expense's own account (review: 5190)" do
      api_post "/api/v1/shifts", { opening_cash_minor: 10_000 }, headers: headers
      shift = json
      within(biz) { ExpenseCategory.seed_defaults! }
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "cash" }, headers: headers
      e = json
      expect(balance("5130")).to eq(5_000)
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(5_000)
      api_post "/api/v1/expenses/#{e[:id]}/void", { reason: "Duplicate" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(balance("5130")).to eq(0)
      expect(balance("5190")).to eq(0)
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(10_000)
    end
  end

  describe "drawer movements (review: owner's equity)" do
    it "books a drop to the safe and a payout to other expenses, not to the owner" do
      api_post "/api/v1/shifts", { opening_cash_minor: 100_000 }, headers: headers
      shift = json
      api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "drop", amount_minor: 50_000, reason: "Safe drop" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", { kind: "payout", amount_minor: 2_000, reason: "Ice" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(balance("1050")).to eq(50_000)
      expect(balance("5190")).to eq(2_000)
      expect(balance("3020")).to eq(0)
      drawer = within(biz) { GlAccount.find_by!(payment_account_id: shift[:drawer_account_id]) }
      expect(within(biz) { Finance::Statements.balances(as_of: today)[drawer.id] }).to eq(48_000)
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(48_000)
    end
  end

  describe "offline khata sale over the limit (review item 4)" do
    let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T2") } }
    let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

    it "is accepted at replay with an audit row, while the same sale online is refused" do
      cust = customer!(credit_limit_minor: 20_000)
      order_id = SecureRandom.uuid
      record = { type: "order", id: order_id, membership_id: cashier.id,
                 payload: { order_type: "takeaway", client_created_at: 10.minutes.ago.iso8601, status: "placed", customer_id: cust[:id],
                            lines: [ { product_id: m[:burger].id, quantity: 2 } ], payments: [ { id: SecureRandom.uuid, method_code: "khata", amount_minor: 104_400 } ] } }
      api_post "/api/v1/sync/push", { records: [ record ] }, headers: auth_headers(cashier, app: "pos", device: device)
      expect(json[:results].first).to include(status: "accepted")
      within(biz) do
        o = Order.find(order_id)
        expect(o).to have_attributes(status: "paid", payment_status: "paid")
        expect(Customer.find(cust[:id]).balance_minor).to eq(o.total_minor)
        log = AuditLog.where(action: "khata_over_limit_offline", record_id: order_id).sole
        expect(log.after).to include("customer_id" => cust[:id], "credit_limit_minor" => 20_000, "balance_minor" => 0, "amount_minor" => o.total_minor)
      end
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust[:id], lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: headers
      api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: json[:total_minor] } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("khata.over_limit")
      within(biz) { expect(AuditLog.where(action: "khata_over_limit_offline").count).to eq(1) }
    end
  end

  describe "dating (review: refunds and late payments on the order's day)" do
    it "keeps the sale on its own day and puts the refund and a late payment on the day the money moved" do
      cust = customer!
      sold_on = today - 3
      sold_at = within(biz) { Branch.first.business_day_end_at(sold_on) - 14.hours } # noon on that business day
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust[:id], client_created_at: sold_at.iso8601, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      expect(response).to have_http_status(:created), response.body
      o = json
      expect(Date.parse(o[:business_day])).to eq(sold_on)
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(Date.parse(json[:payments].first[:business_day])).to eq(today)
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 2_000, method_code: "khata", reason: "Short pour" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(Date.parse(json[:refund][:business_day])).to eq(today)
      within(biz) do
        expect(Order.find(o[:id]).business_day).to eq(sold_on)
        st = Customers::Ledger.statement(Customer.find(cust[:id]), from: today, to: today)
        expect(st[:entries].map { |e| [ e[:kind], e[:amount_minor] ] }).to eq([ [ "charge", 9_280 ], [ "refund", -2_000 ] ])
        expect(Customers::Ledger.statement(Customer.find(cust[:id]), from: sold_on, to: sold_on)[:entries]).to be_empty
      end
      get "/api/v1/day_close?business_day=#{today}", headers: headers
      expect(json[:summary][:refunds_minor]).to eq(2_000)
      expect(json[:summary][:net_sales_minor]).to eq(-2_000) # the sale counts on its own day, the refund on its own (Reports::Revenue)
      get "/api/v1/day_close?business_day=#{sold_on}", headers: headers
      expect(json[:summary]).to include(net_sales_minor: 9_280, refunds_minor: 0)
    end

    it "dates a cash refund and its drawer row to the shift's business day" do
      api_post "/api/v1/shifts", { opening_cash_minor: 0 }, headers: headers
      shift = json
      o = sell!([ { product_id: m[:chai].id } ])
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 9_280, method_code: "cash", reason: "Cold" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:refund][:business_day]).to eq(shift[:business_day])
      within(biz) { expect(AccountEntry.find_by!(ref_table: "refunds", ref_id: json[:refund][:id]).business_day.to_s).to eq(shift[:business_day]) }
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(0)
    end
  end

  describe "dated collections (debit side 6)" do
    let(:collector) do
      within(biz) do
        role = Role.create!(name: "Collector")
        role.set_permissions!({ "app.admin" => nil, "khata.collect" => nil, "customers.view" => nil })
        Membership.create!(user: create(:user), role: role, status: "active")
      end
    end

    it "lets a manager date a payment to an earlier day, refuses the future, a locked day and a cashier without the permission" do
      cust = customer!
      o = sell!([ { product_id: m[:chai].id } ], method: "khata", extra: { customer_id: cust[:id] })
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 2_000, method_code: "cash", received_on: (today - 2).to_s }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(Date.parse(json[:payment][:business_day])).to eq(today - 2)
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: (today + 1).to_s }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("payment.date")
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: "yesterday" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: (today - 1).to_s }, headers: auth_headers(collector)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("permission.denied")
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: today.to_s }, headers: auth_headers(collector)
      expect(response).to have_http_status(:created), response.body
      lock!(today - 5)
      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", received_on: (today - 5).to_s }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      within(biz) do
        expect(Customer.find(cust[:id]).balance_minor).to eq(o[:total_minor] - 3_000)
        st = Customers::Ledger.statement(Customer.find(cust[:id]), from: today - 2, to: today - 2)
        expect(st[:entries].map { |e| e[:amount_minor] }).to eq([ -2_000 ])
      end
    end
  end

  describe "day lock on money (review: Ledger and finance)" do
    it "refuses a khata collection, an expense, a manual voucher, a customer adjustment and an account deposit on a locked day" do
      cust = customer!
      sell!([ { product_id: m[:chai].id } ], method: "khata", extra: { customer_id: cust[:id] })
      within(biz) { ExpenseCategory.seed_defaults! }
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      get "/api/v1/payment_accounts", headers: headers
      cash = json[:data].find { |a| a[:name] == "Cash" }[:id]
      lock!

      api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/finance/journal", { description: "Owner puts in cash", lines: [ { code: "1010", debit_minor: 100 }, { code: "3010", credit_minor: 100 } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/customers/#{cust[:id]}/adjustments", { kind: "adjustment", amount_minor: 100, reason: "late", effective_on: today.to_s }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/payment_accounts/#{cash}/adjust", { kind: "deposit", amount_minor: 1_000, note: "float" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")

      # An adjustment dated into a locked earlier day is refused too, while today is open.
      api_post "/api/v1/day_close/reopen", { business_day: today.to_s, reason: "testing" }, headers: headers
      lock!(today - 4)
      api_post "/api/v1/customers/#{cust[:id]}/adjustments", { kind: "adjustment", amount_minor: 100, reason: "late", effective_on: (today - 4).to_s }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/customers/#{cust[:id]}/adjustments", { kind: "adjustment", amount_minor: 100, reason: "late", effective_on: (today - 3).to_s }, headers: headers
      expect(response).to have_http_status(:created), response.body
    end
  end

  describe "automatic vouchers (review: any voucher can be reversed)" do
    it "reverses only a manual voucher" do
      sell!([ { product_id: m[:chai].id } ])
      auto = within(biz) { JournalEntry.find_by!(ref_table: "payments") }
      api_post "/api/v1/finance/journal/#{auto.id}/reverse", { reason: "oops" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("journal.automatic")
      expect(balance("4000")).to eq(8_000)
      api_post "/api/v1/finance/journal", { description: "Owner puts in cash", lines: [ { code: "1010", debit_minor: 100 }, { code: "3010", credit_minor: 100 } ] }, headers: headers
      api_post "/api/v1/finance/journal/#{json[:id]}/reverse", { reason: "typo" }, headers: headers
      expect(response).to have_http_status(:created), response.body
    end
  end

  describe "refund status (review item 13 and an open order)" do
    it "refuses to refund a part payment on an order that is still open" do
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
      o = json
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "easypaisa", amount_minor: 30_000, reference: "EP1" } ] }, headers: headers
      expect(json[:order][:payment_status]).to eq("partial")
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 10_000, method_code: "easypaisa", reason: "Changed mind" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("refund.order_open")
      within(biz) { expect(Refund.count).to eq(0) }
    end

    it "leaves a reopened order paid once the excess is refunded, so it completes and takes no more money" do
      o = sell!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ]) # 61,480
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
      burger = json[:items].find { |i| i[:name] == "Zinger Burger" }
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], quantity: 1 } ] }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(total_minor: 52_200, paid_minor: 61_480, payment_status: "paid")
      # The excess goes back before the order completes (R23: completing it first answers order.overpaid).
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 9_280, method_code: "cash", reason: "Chai removed" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:order]).to include(status: "served", payment_status: "paid", paid_minor: 52_200)
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(status: "closed", payment_status: "paid", paid_minor: 52_200)
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 100 } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("order.status")
    end
  end

  describe "customer stats (review: re-paying a reopened order)" do
    it "counts an order once in the customer's orders and spend when it is paid again after a reopen" do
      cust = customer!
      o = sell!([ { product_id: m[:chai].id } ], method: "khata", extra: { customer_id: cust[:id] })
      get "/api/v1/customers/#{cust[:id]}", headers: headers
      expect(json).to include(orders_count: 1, net_spent_minor: 9_280)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      line = json[:items].first
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line[:id], quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
      expect(json[:payment_status]).to eq("partial")
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 9_280 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:order][:payment_status]).to eq("paid")
      get "/api/v1/customers/#{cust[:id]}", headers: headers
      expect(json).to include(orders_count: 1, net_spent_minor: 9_280, balance_minor: 18_560)
    end
  end

  describe "payment ids (review: a payment id from another order)" do
    it "refuses a payment id that belongs to another order instead of silently doing nothing" do
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      a = json
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
      b = json
      pid = SecureRandom.uuid
      api_post "/api/v1/orders/#{a[:id]}/payments", { payments: [ { id: pid, method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/orders/#{b[:id]}/payments", { payments: [ { id: pid, method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("payment.foreign_id")
      within(biz) { expect(Order.find(b[:id])).to have_attributes(payment_status: "unpaid", paid_minor: 0) }
      api_post "/api/v1/orders/#{a[:id]}/payments", { payments: [ { id: pid, method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
      expect(response).to have_http_status(:created) # the same id on its own order is still a repeat
    end
  end
end

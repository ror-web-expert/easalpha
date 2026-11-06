require "rails_helper"
require Rails.root.join("db/migrate/20261107010100_reversal_entries_keep_shift")

# The cash drawer agrees with the money that really moved on that till, and the books show it (final fix round,
# 6 Nov 2026: QA T4, T7, B1, B3, B6, B7, B8, F1; review ledger#2, ledger#3, ledger#7, ledger#9, reports#7,
# contracts#3, deploy#7).
RSpec.describe "Cash drawer, shifts and the books", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:second) { add_member!(biz, "cashier", pin: "2222") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:till) { within(biz) { Device.create!(branch: Branch.first, name: "Till 1", kind: "till", paired_at: Time.current, code: "DT1") } }

  def at_till(member, device: till) = auth_headers(member, app: "pos", device: device)

  def order!(as:, lines: [ { product_id: m[:chai].id } ], extra: {})
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: as
    expect(response).to have_http_status(:created), response.body
    json
  end

  def cash_sale!(as:, lines: [ { product_id: m[:chai].id } ])
    o = order!(as: as, lines: lines)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: as
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def open_shift!(as:, float:)
    api_post "/api/v1/shifts", { opening_cash_minor: float }, headers: as
    expect(response).to have_http_status(:created), response.body
    json
  end

  def move!(shift, as:, **body)
    api_post "/api/v1/shifts/#{shift[:id]}/cash_movements", body, headers: as
    expect(response).to have_http_status(:created), response.body
    json
  end

  def gl(code) = within(biz) { Finance::Statements.balances(as_of: today)[GlAccount.find_by!(code: code).id].to_i }
  def gl_of(account) = within(biz) { Finance::Statements.balances(as_of: today)[GlAccount.find_by!(payment_account_id: account.id).id].to_i }
  def safe = within(biz) { PaymentAccount.find_by(kind: "safe") }
  def company_cash = within(biz) { PaymentAccount.find_by!(kind: "cash", is_default: true) }

  # The Z report's cash rows, added up the way the till prints them.
  def rows_total(c)
    c[:opening_minor] + c[:cash_sales_minor] - c[:cash_refunds_minor] + c[:khata_collected_minor] - c[:khata_paid_out_minor] + c[:cash_in_minor] - c[:cash_out_minor] -
      c[:drops_minor] - c[:payouts_minor] - c[:expenses_minor] - c[:supplier_payments_minor] + c[:supplier_refunds_minor] + c[:rider_float_minor] + c[:other_minor]
  end

  def books_balanced!
    within(biz) do
      JournalEntry.includes(:lines).find_each { |e| expect(e.lines.sum(&:debit_minor)).to eq(e.lines.sum(&:credit_minor)), "#{e.label} #{e.description} is unbalanced" }
      expect(Finance::Statements.trial_balance(from: today - 30, to: today)[:balanced]).to be(true)
      expect(Finance::Statements.balance_sheet(as_of: today)[:balanced]).to be(true)
      # Every payment account's ledger mirror holds what the account itself holds.
      PaymentAccount.find_each { |a| expect(gl_of(a)).to eq(a.current_balance_minor), "#{a.name}: account #{a.current_balance_minor}, ledger #{gl_of(a)}" if GlAccount.exists?(payment_account_id: a.id) }
    end
  end

  it "walks a whole shift at one till: every drawer row lands in that till's shift, the Z rows add up, the count reaches the books and the settlement moves the counted cash" do
    manager
    shift = open_shift!(as: at_till(cashier), float: 100_000) # the first float: the safe holds nothing yet, so it is the owner's
    sale = cash_sale!(as: at_till(cashier))                     # +9,280
    cash_sale!(as: at_till(second))                             # a second cashier at the same till, no shift of their own: +9,280
    api_post "/api/v1/orders/#{sale[:id]}/refunds", { amount_minor: 2_000, method_code: "cash", reason: "Cold chai" }, headers: at_till(manager) # the manager at this till: -2,000
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567", addresses: [ { line1: "Flat 3", area: "Gulberg" } ] }, headers: headers
    cust = json
    api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 5_000, method_code: "cash" }, headers: at_till(cashier) # khata collected: +5,000
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/customers/#{cust[:id]}/payments", { amount_minor: 1_000, method_code: "cash", direction: "paid" }, headers: at_till(cashier) # paid back: -1,000
    expect(response).to have_http_status(:created), response.body
    within(biz) { ExpenseCategory.seed_defaults! }
    gas = within(biz) { ExpenseCategory.find_by!(name: "Gas") }
    api_post "/api/v1/expenses", { category_id: gas.id, amount_minor: 3_000, method_code: "cash", paid_to: "Gas cylinder shop" }, headers: at_till(cashier) # -3,000
    expect(response).to have_http_status(:created), response.body
    move!(shift, as: at_till(cashier), kind: "drop", amount_minor: 20_000, reason: "Too much cash")                # -20,000 to the safe
    move!(shift, as: at_till(cashier), kind: "payout", amount_minor: 1_500, reason: "Ice", paid_to: "Ice man") # -1,500, an expense
    move!(shift, as: at_till(cashier), kind: "cash_in", amount_minor: 500, reason: "Change")                     # +500, from the safe
    move!(shift, as: at_till(cashier), kind: "cash_out", amount_minor: 700, reason: "Owner took cash")          # -700, the owner's

    # Cash on delivery: delivered with the cash, settled at this till; the settlement takes the order's cash payment.
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust[:id], address_id: cust[:addresses].first[:id], lines: [ { product_id: m[:chai].id, quantity: 2 } ], place: true }, headers: at_till(cashier)
    cod = json
    api_post "/api/v1/riders", { name: "Asad", phone: "03122222222" }, headers: headers
    rider = json
    api_post "/api/v1/orders/#{cod[:id]}/delivery/assign", { rider_id: rider[:id] }, headers: headers
    api_post "/api/v1/orders/#{cod[:id]}/delivery/status", { status: "picked_up" }, headers: headers
    api_post "/api/v1/orders/#{cod[:id]}/delivery/status", { status: "delivered", cash_collected_minor: cod[:total_minor] }, headers: headers
    api_post "/api/v1/riders/#{rider[:id]}/settle", { handed_in_minor: cod[:total_minor] }, headers: at_till(cashier)
    expect(response).to have_http_status(:created), response.body
    expect(json[:settlement][:difference_minor]).to eq(0)

    expected = 100_000 + 9_280 + 9_280 - 2_000 + 5_000 - 1_000 - 3_000 - 20_000 - 1_500 + 500 - 700 + cod[:total_minor]
    get "/api/v1/shifts/#{shift[:id]}/z_report", headers: at_till(cashier)
    c = json[:cash]
    expect(c).to include(opening_minor: 100_000, cash_sales_minor: 9_280 * 2 + cod[:total_minor], cash_refunds_minor: 2_000, khata_collected_minor: 5_000, khata_paid_out_minor: 1_000,
                         expenses_minor: 3_000, drops_minor: 20_000, payouts_minor: 1_500, cash_in_minor: 500, cash_out_minor: 700, other_minor: 0, expected_minor: expected)
    expect(rows_total(c)).to eq(expected)
    expect(json[:refunds]).to include(count: 1, amount_minor: 2_000)
    within(biz) do
      expect(Order.where(shift_id: shift[:id]).count).to eq(3) # the second cashier's sale and the delivery are this till's
      expect(Payment.where(order_id: cod[:id]).sole).to have_attributes(shift_id: shift[:id], method_code: "cash", amount_minor: cod[:total_minor])
      expect(Expense.where(shift_id: shift[:id]).pluck(:note, :amount_minor)).to contain_exactly([ nil, 3_000 ], [ "Ice", 1_500 ])
    end

    api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: expected - 300 }, headers: at_till(cashier)
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(expected_cash_minor: expected, counted_cash_minor: expected - 300, over_short_minor: -300)
    get "/api/v1/shifts/#{shift[:id]}/z_report", headers: at_till(cashier) # the stored Z, as the till prints it after the close
    expect(json[:cash]).to include(expected_minor: expected, counted_minor: expected - 300, over_short_minor: -300)
    expect(rows_total(json[:cash])).to eq(expected)
    expect(gl("5195")).to eq(300) # the short is in the books
    books_balanced!

    api_post "/api/v1/day_end_settlements", {}, headers: headers
    expect(response).to have_http_status(:created), response.body
    float_back = 100_000 + 500 # the float and the cash in went back to the safe at the count
    expect(json).to include(shifts_count: 1, amount_minor: expected - 300 - float_back)
    expect(json[:detail][:shifts].sole).to include(shift_id: shift[:id], counted_minor: expected - 300, over_short_minor: -300, float_to_safe_minor: float_back, amount_minor: expected - 300 - float_back)
    within(biz) { expect(PaymentAccount.find(shift[:drawer_account_id]).current_balance_minor).to eq(0) }
    expect(company_cash.current_balance_minor).to eq(expected - 300 - float_back)
    expect(safe.current_balance_minor).to eq(20_000 - 500 + float_back)
    expect(gl("3010")).to eq(100_000) # the one float the books never saw, once
    expect(gl("3020")).to eq(700)     # the cash out
    expect(gl("5190")).to eq(1_500)   # the payout, under Petty cash
    books_balanced!
  end

  describe "the shift of the till (QA T4, B1)" do
    it "puts a second cashier's sale, a manager's refund and offline records at that till into the till's open shift" do
      shift = open_shift!(as: at_till(cashier), float: 0)
      get "/api/v1/shifts/current", headers: at_till(second)
      expect(json[:shift]).to include(id: shift[:id], cashier_name: cashier.user.name)
      o = cash_sale!(as: at_till(second))
      within(biz) do
        expect(Order.find(o[:id]).shift_id).to eq(shift[:id])
        expect(Payment.find_by!(order_id: o[:id]).shift_id).to eq(shift[:id])
      end
      # The till queued a refund by the manager and a sale by the second cashier while it was offline.
      sid = SecureRandom.uuid
      api_post "/api/v1/sync/push", { records: [ { type: "refund", id: SecureRandom.uuid, payload: { order_id: o[:id], amount_minor: 1_000, method_code: "cash", reason: "Spilt" } } ] }, headers: at_till(manager)
      expect(json[:results].sole).to include(status: "accepted")
      api_post "/api/v1/sync/push", { records: [ { type: "order", id: sid, payload: { order_type: "takeaway", status: "placed", client_created_at: 5.minutes.ago.iso8601, lines: [ { product_id: m[:chai].id } ],
                                                                                        payments: [ { id: SecureRandom.uuid, method_code: "cash", amount_minor: 9_280, tendered_minor: 9_280 } ] } } ] }, headers: at_till(second)
      expect(json[:results].sole).to include(status: "accepted")
      within(biz) do
        expect(Refund.sole).to have_attributes(shift_id: shift[:id], payment_account_id: shift[:drawer_account_id])
        expect(Payment.find_by!(order_id: sid).shift_id).to eq(shift[:id])
      end
      get "/api/v1/shifts/#{shift[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(9_280 - 1_000 + 9_280)
      # The second cashier may move this till's cash, but not close another cashier's shift.
      move!(shift, as: at_till(second), kind: "cash_in", amount_minor: 1_000, reason: "Change")
      api_post "/api/v1/shifts/#{shift[:id]}/close", { counted_cash_minor: 0 }, headers: at_till(second)
      expect(response).to have_http_status(:forbidden)
    end

    it "keeps a till without an open shift on the member's own shift, and the admin panel on the member's own" do
      other_till = within(biz) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current, code: "DT2") }
      shift = open_shift!(as: at_till(cashier), float: 0)
      o = cash_sale!(as: at_till(cashier, device: other_till))
      within(biz) { expect(Payment.find_by!(order_id: o[:id]).shift_id).to eq(shift[:id]) }
      o = cash_sale!(as: auth_headers(manager))
      within(biz) { expect(Payment.find_by!(order_id: o[:id]).shift_id).to be_nil }
    end
  end

  describe "the float and the safe (QA B3, review ledger#3 and ledger#7)" do
    it "takes the next float from the safe it went back to, so capital and company cash do not grow by the float every shift" do
      2.times do
        s = open_shift!(as: at_till(cashier), float: 100_000)
        api_post "/api/v1/shifts/#{s[:id]}/close", { counted_cash_minor: 100_000 }, headers: at_till(cashier)
        expect(response).to have_http_status(:ok), response.body
        api_post "/api/v1/shifts/#{s[:id]}/settle", {}, headers: headers
        expect(response).to have_http_status(:ok), response.body
      end
      expect(gl("3010")).to eq(100_000) # was 200,000: a new capital entry for each float
      expect(company_cash.current_balance_minor).to eq(0) # was 200,000: the float settled as takings
      expect(safe.current_balance_minor).to eq(100_000)
      books_balanced!
    end

    it "banks the safe into a bank account, and a cash in beyond what the safe holds is the owner's money, never a negative safe" do
      s = open_shift!(as: at_till(cashier), float: 0)
      cash_sale!(as: at_till(cashier))
      move!(s, as: at_till(cashier), kind: "drop", amount_minor: 9_000, reason: "Drop")
      move!(s, as: at_till(cashier), kind: "cash_in", amount_minor: 10_000, reason: "Change from the owner")
      expect(safe.current_balance_minor).to eq(0)
      expect(gl("3010")).to eq(1_000) # 9,000 came out of the safe, the other 1,000 from the owner
      api_post "/api/v1/payment_accounts", { name: "Meezan", kind: "bank" }, headers: headers
      bank = json
      move!(s, as: at_till(cashier), kind: "drop", amount_minor: 5_000, reason: "Drop")
      api_post "/api/v1/payment_accounts/#{safe.id}/transfer", { to_account_id: bank[:id], amount_minor: 5_000, note: "Banked" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(safe.current_balance_minor).to eq(0)
      expect(gl_of(safe)).to eq(0)
      expect(gl("1050")).to eq(0)
      expect(within(biz) { PaymentAccount.find(bank[:id]).current_balance_minor }).to eq(5_000)
      books_balanced!
    end

    it "opens the safe with the drops booked to Cash in Safe before it was an account" do
      within(biz) do
        Finance::Journal.post!(business_day: today, description: "Drop before the safe account", branch_id: Branch.first.id,
                               lines: [ { account: "1050", debit_minor: 40_000 }, { account: "3010", credit_minor: 40_000 } ])
      end
      open_shift!(as: at_till(cashier), float: 10_000)
      expect(safe.current_balance_minor).to eq(30_000) # 40,000 carried in, 10,000 out as the float
      expect(gl("1050")).to eq(0)
      expect(gl("3010")).to eq(40_000) # the float came out of the safe, not from new capital
      books_balanced!
    end
  end

  describe "the count and the settlement (QA B6)" do
    it "books each count's over or short and settles each shift with its own counted cash, also for two shifts of one cashier" do
      first = open_shift!(as: at_till(cashier), float: 0)
      cash_sale!(as: at_till(cashier))
      api_post "/api/v1/shifts/#{first[:id]}/close", { counted_cash_minor: 9_000 }, headers: at_till(cashier)
      second_shift = open_shift!(as: at_till(cashier), float: 0)
      cash_sale!(as: at_till(cashier), lines: [ { product_id: m[:chai].id, quantity: 2 } ])
      api_post "/api/v1/shifts/#{second_shift[:id]}/close", { counted_cash_minor: 18_600 }, headers: at_till(cashier)
      expect(json[:over_short_minor]).to eq(40)
      expect(gl("5195")).to eq(280 - 40)
      api_post "/api/v1/day_end_settlements", {}, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json).to include(shifts_count: 2, amount_minor: 9_000 + 18_600)
      expect(json[:detail][:shifts].map { |d| [ d[:shift_id], d[:counted_minor], d[:amount_minor] ] }).to eq([ [ first[:id], 9_000, 9_000 ], [ second_shift[:id], 18_600, 18_600 ] ])
      expect(company_cash.current_balance_minor).to eq(27_600)
      books_balanced!
    end

    it "posts the count of a shift closed before the fix at its settlement, and a force-closed shift is settled by the day end" do
      s = open_shift!(as: at_till(cashier), float: 5_000)
      cash_sale!(as: at_till(cashier))
      within(biz) do
        # Closed by the code before 7 Nov 2026: the count is on the shift, nothing of it in the books.
        Shift.find(s[:id]).update_columns(status: "closed", closed_at: Time.current, expected_cash_minor: 14_280, counted_cash_minor: 14_000, over_short_minor: -280)
        PaymentAccount.find(s[:drawer_account_id]).update!(shift_id: nil)
      end
      forced = open_shift!(as: at_till(second), float: 0)
      api_post "/api/v1/shifts/#{forced[:id]}/close", { counted_cash_minor: 0, force: true }, headers: headers
      expect(json[:status]).to eq("force_closed")
      api_post "/api/v1/day_end_settlements", {}, headers: headers
      expect(json[:shifts_count]).to eq(2)
      expect(json[:detail][:shifts].find { |d| d[:shift_id] == s[:id] }).to include(counted_minor: 14_000, float_to_safe_minor: 5_000, amount_minor: 9_000)
      expect(gl("5195")).to eq(280)
      expect(company_cash.current_balance_minor).to eq(9_000)
      books_balanced!
    end
  end

  describe "drawer movements (QA B7)" do
    it "asks a manager's PIN above the role's cash.in_out limit and from someone without the permission" do
      manager
      within(biz) { cashier.role.role_permissions.find_by!(permission_code: "cash.in_out").update!(limit_value: 100) } # Rs 100 without a PIN
      s = open_shift!(as: at_till(cashier), float: 50_000)
      move!(s, as: at_till(cashier), kind: "drop", amount_minor: 10_000, reason: "Drop")
      api_post "/api/v1/shifts/#{s[:id]}/cash_movements", { kind: "drop", amount_minor: 20_000, reason: "Drop" }, headers: at_till(cashier)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error]).to include(code: "approval.required")
      expect(json[:error][:details][:permissions]).to eq([ "shifts.any" ])
      mv = move!(s, as: at_till(cashier), kind: "payout", amount_minor: 20_000, reason: "Fish", paid_to: "Fish market", approver_pin: "9999", approval_codes: [ "shifts.any" ])
      expect(mv[:movement][:approved_by_membership_id]).to eq(manager.id)
      expect(within(biz) { Expense.sole.approved_by_membership_id }).to eq(manager.id)
      move!(s, as: at_till(cashier), kind: "cash_in", amount_minor: 90_000, reason: "Change") # money in needs no PIN
      waiter = add_member!(biz, "waiter", pin: "3333")
      api_post "/api/v1/shifts/#{s[:id]}/cash_movements", { kind: "cash_out", amount_minor: 500, reason: "Owner" }, headers: at_till(waiter)
      expect(json[:error][:code]).to eq("approval.required")
      move!(s, as: at_till(waiter), kind: "cash_out", amount_minor: 500, reason: "Owner", approver_pin: "9999", approval_codes: [ "shifts.any" ])
    end

    it "replays an offline drop over the limit only with a manager's PIN, and an offline payout keeps its category" do
      manager
      within(biz) { cashier.role.role_permissions.find_by!(permission_code: "cash.in_out").update!(limit_value: 100) }
      s = open_shift!(as: at_till(cashier), float: 50_000)
      within(biz) { ExpenseCategory.seed_defaults! }
      fuel = within(biz) { ExpenseCategory.find_by!(name: "Fuel") }
      records = [ { type: "cash_movement", id: SecureRandom.uuid, payload: { shift_id: s[:id], kind: "drop", amount_minor: 20_000, reason: "Drop" } },
                  { type: "cash_movement", id: SecureRandom.uuid, payload: { shift_id: s[:id], kind: "payout", amount_minor: 15_000, reason: "Petrol", category_id: fuel.id, paid_to: "PSO" } } ]
      api_post "/api/v1/sync/push", { records: records }, headers: at_till(cashier)
      expect(json[:results].map { |r| [ r[:status], r[:code] ] }).to eq([ [ "rejected", "approval.required" ], [ "rejected", "approval.required" ] ])
      api_post "/api/v1/sync/push", { records: records.map { |r| r.merge(approver_pin: "9999", approval_codes: [ "shifts.any" ]) } }, headers: at_till(cashier)
      expect(json[:results].map { |r| r[:status] }).to eq(%w[accepted accepted])
      within(biz) { expect(Expense.sole).to have_attributes(category_id: fuel.id, paid_to: "PSO", note: "Petrol", shift_id: s[:id]) }
      expect(safe.current_balance_minor).to eq(20_000)
    end

    it "keeps a voided payout out of the drawer and off the Z report's payouts" do
      s = open_shift!(as: at_till(cashier), float: 10_000)
      move!(s, as: at_till(cashier), kind: "payout", amount_minor: 2_000, reason: "Ice")
      api_post "/api/v1/expenses/#{within(biz) { Expense.sole.id }}/void", { reason: "Twice" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      get "/api/v1/shifts/#{s[:id]}/z_report", headers: headers
      expect(json[:cash]).to include(payouts_minor: 0, expenses_minor: 0, expected_minor: 10_000)
    end
  end

  describe "the Z report (QA T7, B8)" do
    it "leaves a staff meal that was never charged out of the sales and the tax" do
      s = open_shift!(as: at_till(cashier), float: 0)
      cash_sale!(as: at_till(cashier))
      meal = order!(as: headers, extra: { is_staff_meal: true, staff_meal_reason: "Lunch" })
      within(biz) { Order.find(meal[:id]).update_columns(shift_id: s[:id]) }
      api_post "/api/v1/orders/#{meal[:id]}/complete", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(within(biz) { Order.find(meal[:id]).tax_minor }).to be_positive
      get "/api/v1/shifts/#{s[:id]}/z_report", headers: headers
      expect(json[:orders]).to include(staff_meals: 1)
      expect(json[:sales]).to include(gross_minor: 8_000, tax_minor: 1_280, net_minor: 9_280)
    end
  end

  describe "dating (review ledger#2)" do
    it "dates a payment and a refund on a shift opened on the previous business day by the day the money moves" do
      s = open_shift!(as: at_till(cashier), float: 0)
      within(biz) { Shift.find(s[:id]).update_columns(business_day: today - 1) } # opened before the cutoff, still open after it
      o = cash_sale!(as: at_till(cashier))
      within(biz) { expect(Payment.find_by!(order_id: o[:id])).to have_attributes(business_day: today, shift_id: s[:id]) }
      api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 1_000, method_code: "cash", reason: "Cold" }, headers: at_till(manager)
      expect(Date.parse(json[:refund][:business_day])).to eq(today)
      within(biz) { expect(Refund.sole.shift_id).to eq(s[:id]) }
    end

    it "puts a shift opened offline on a day locked since on today, so its payments are taken" do
      yesterday = today - 1
      api_post "/api/v1/day_close/lock", { business_day: yesterday.to_s, force: true }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      opened_at = within(biz) { Branch.first.business_day_end_at(yesterday) - 3.hours }
      sid = SecureRandom.uuid
      api_post "/api/v1/sync/push", { records: [ { type: "shift_open", id: sid, payload: { opening_cash_minor: 0, client_created_at: opened_at.iso8601 } } ] }, headers: at_till(cashier)
      expect(json[:results].sole).to include(status: "accepted")
      within(biz) { expect(Shift.find(sid).business_day).to eq(today) }
      o = cash_sale!(as: at_till(cashier))
      within(biz) { expect(Payment.find_by!(order_id: o[:id]).shift_id).to eq(sid) }
    end
  end

  describe "cash on delivery (QA F1)" do
    let(:cust) do
      api_post "/api/v1/customers", { name: "Omar", phone: "03009998877", addresses: [ { line1: "Flat 3", area: "Gulberg" } ] }, headers: headers
      json
    end

    def delivered!(rider)
      api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust[:id], address_id: cust[:addresses].first[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: at_till(cashier)
      o = json
      api_post "/api/v1/orders/#{o[:id]}/delivery/assign", { rider_id: rider[:id] }, headers: headers
      api_post "/api/v1/orders/#{o[:id]}/delivery/status", { status: "picked_up" }, headers: headers
      api_post "/api/v1/orders/#{o[:id]}/delivery/status", { status: "delivered", cash_collected_minor: o[:total_minor] }, headers: headers
      o
    end

    it "counts the cash once when the till takes the payment and the rider is settled after" do
      s = open_shift!(as: at_till(cashier), float: 100_000)
      api_post "/api/v1/riders", { name: "Asad", phone: "03122222222" }, headers: headers
      rider = json
      o = delivered!(rider)
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: at_till(cashier)
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/riders/#{rider[:id]}/settlement_preview", headers: at_till(cashier)
      expect(json).to include(cash_collected_minor: 0, collected_total_minor: o[:total_minor], paid_at_till_minor: o[:total_minor], expected_minor: 0)
      api_post "/api/v1/riders/#{rider[:id]}/settle", { handed_in_minor: 0 }, headers: at_till(cashier)
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/shifts/#{s[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(100_000 + o[:total_minor]) # was 100,000 + twice the bill
    end

    it "counts the cash once when the rider is settled first: the settlement pays the order, and the till finds nothing left to take" do
      s = open_shift!(as: at_till(cashier), float: 100_000)
      api_post "/api/v1/riders", { name: "Asad", phone: "03122222222" }, headers: headers
      rider = json
      o = delivered!(rider)
      api_post "/api/v1/riders/#{rider[:id]}/settle", { handed_in_minor: o[:total_minor] }, headers: at_till(cashier)
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/orders/#{o[:id]}", headers: headers
      expect(json[:payment_status]).to eq("paid")
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: at_till(cashier)
      expect(response).not_to have_http_status(:created)
      get "/api/v1/shifts/#{s[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(100_000 + o[:total_minor])
      expect(gl("3010")).to eq(100_000) # no COD deposit booked as capital
      books_balanced!
    end
  end

  describe "a reversal written before the fix (review deploy#7)" do
    it "takes the shift of the entry it reverses, so the shift's expected cash gets the voided expense back" do
      s = open_shift!(as: at_till(cashier), float: 10_000)
      within(biz) { ExpenseCategory.seed_defaults! }
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "cash" }, headers: at_till(cashier)
      api_post "/api/v1/expenses/#{json[:id]}/void", { reason: "Duplicate" }, headers: headers
      within(biz) do
        rev = AccountEntry.where(ref_table: "expenses").where("amount_minor > 0").sole
        AccountEntry.where(id: rev.id).update_all(shift_id: nil) # as production's reverse! wrote it
      end
      get "/api/v1/shifts/#{s[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(5_000)
      ActiveRecord::Migration.suppress_messages { ReversalEntriesKeepShift.new.up }
      get "/api/v1/shifts/#{s[:id]}", headers: headers
      expect(json[:expected_cash_minor]).to eq(10_000)
    end
  end
end

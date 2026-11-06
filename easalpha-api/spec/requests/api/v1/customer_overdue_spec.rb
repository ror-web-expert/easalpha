require "rails_helper"

# Debit side 7 and 9 of the 6 Nov 2026 review: a WhatsApp reminder after a bill's due date (one per customer per bill
# run), a hold on new sales on account when a bill is overdue, the settings behind them, and the bill link's life.
RSpec.describe "Customer bills overdue", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def customer!(attrs = {})
    api_post "/api/v1/customers", { name: "Ali Raza", phone: "+923001112233", guardian_phone: "+923009998877", notify_guardian: true }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  # on: the day the sale goes on the account (a bill covers what was bought inside its period); today by default.
  def sale!(cid, on: nil)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cid, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    within(biz) { Payment.where(order_id: o[:id]).update_all(business_day: on) } if on
    o
  end

  def last_month_end = today.prev_month.end_of_month

  # A finished bill run as Customers::Bills records it, with one sent row per customer and a due date.
  def bill_run!(rows, due_on:, period_to: today.prev_month.end_of_month)
    within(biz) do
      BillRun.create!(period_from: period_to.beginning_of_month, period_to: period_to, due_on: due_on, trigger: "manual", status: "done", customers_count: rows.size, sent_count: rows.size,
                      results: rows.map { |c, due| { customer_id: c[:id], name: c[:name], khata_no: c[:khata_no], due_minor: due, status: "sent", to: [ c[:phone] ] } })
    end
  end

  def reminders(cid) = WhatsappMessage.where(business_id: biz.id, customer_id: cid, template_name: "account_overdue")

  it "exposes the overdue settings and the till lock under their screens" do
    get "/api/v1/settings", headers: headers
    accounts = json[:groups][:store][:screens][:"Customer Accounts"].index_by { |k| k[:key] }
    # Off by default: no business starts messaging its customers on the day this ships; the owner opts in.
    expect(accounts["khata.overdue.remind_after_days"]).to include(type: "integer", value: 0)
    expect(accounts["khata.credit_hold_days"]).to include(type: "integer", value: 0)
    pos = json[:groups][:point_of_sale][:screens][:"Order Behavior"].index_by { |k| k[:key] }
    expect(pos["pos.lock_minutes"]).to include(type: "integer", value: 5)
  end

  it "reminds a customer once per bill run after the set days, customer and guardian alike, and skips small balances and bills not yet due" do
    within(biz) { Setting.write!(biz, { "khata.overdue.remind_after_days" => 3 }) }
    a = customer!
    b = customer!(name: "Bilal", phone: "+923001112244", guardian_phone: nil)
    c = customer!(name: "Sana", phone: "+923001112255", guardian_phone: nil)
    sale!(a[:id], on: last_month_end)
    sale!(b[:id], on: last_month_end)
    within(biz) { Customer.find(c[:id]).update_columns(balance_minor: 50) } # below the Rs 1 minimum
    run = bill_run!([ [ a, 9_280 ], [ b, 9_280 ], [ c, 50 ] ], due_on: today - 3)
    bill_run!([ [ b, 9_280 ] ], due_on: today - 1, period_to: today - 1) # Bilal's newer bill is not yet 3 days overdue

    # No phone linked: nothing goes out and nothing is recorded, so the next day tries again.
    OverdueRemindersJob.perform_now
    within(biz) { expect(reminders(a[:id]).count).to eq(0) }
    allow(Whatsapp::Provider).to receive(:live?).and_return(true)
    OverdueRemindersJob.perform_now
    within(biz) do
      expect(reminders(a[:id]).pluck(:to_phone)).to contain_exactly("+923001112233", "+923009998877")
      msg = reminders(a[:id]).first
      expect(msg.variables["bill_run_id"]).to eq(run.id)
      expect(msg.variables["text"]).to include("Ali Raza", "3 days overdue", "Rs 92.8", "/bill/") # chai is Rs 92.80 in this menu
      expect(reminders(b[:id]).count).to eq(0)
      expect(reminders(c[:id]).count).to eq(0)
    end
    OverdueRemindersJob.perform_now
    within(biz) { expect(reminders(a[:id]).count).to eq(2) } # the same run again sends nothing more

    within(biz) { Setting.write!(biz, { "khata.overdue.remind_after_days" => 0 }) }
    d = customer!(name: "Dua", phone: "+923001112266", guardian_phone: nil)
    sale!(d[:id], on: today - 21)
    bill_run!([ [ d, 9_280 ] ], due_on: today - 10, period_to: today - 20)
    OverdueRemindersJob.perform_now
    within(biz) { expect(reminders(d[:id]).count).to eq(0) }
  end

  it "holds new sales on account while the latest bill is overdue beyond the setting, until it is paid" do
    a = customer!
    o = sale!(a[:id], on: last_month_end)
    bill_run!([ [ a, o[:total_minor] ] ], due_on: today - 5)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: a[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o2 = json
    api_post "/api/v1/orders/#{o2[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o2[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body # the hold is off by default

    within(biz) { Setting.write!(biz, { "khata.credit_hold_days" => 2 }) }
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: a[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o3 = json
    api_post "/api/v1/orders/#{o3[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o3[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("khata.overdue")
    expect(json[:error][:message]).to include("5 days overdue")
    api_post "/api/v1/orders/#{o3[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o3[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body # cash is still welcome

    # Paying the bill off lifts the hold; the balance from later purchases does not count against it.
    api_post "/api/v1/customers/#{a[:id]}/payments", { amount_minor: o[:total_minor], method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: a[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o4 = json
    api_post "/api/v1/orders/#{o4[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o4[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  # The HTTP status of a new chai put on the customer's account.
  def try_khata(cid)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cid, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    response.status
  end

  # ledger#1, deploy#1: a customer who paid the bill and bought again owes only new purchases, which are not overdue.
  it "never reminds a customer who paid the bill, whatever they bought since, and quotes what is unpaid of it" do
    within(biz) { Setting.write!(biz, { "khata.overdue.remind_after_days" => 3 }) }
    allow(Whatsapp::Provider).to receive(:live?).and_return(true)
    a = customer!(guardian_phone: nil)
    b = customer!(name: "Bilal", phone: "+923001112244", guardian_phone: nil)
    oa = sale!(a[:id], on: last_month_end)
    2.times { sale!(b[:id], on: last_month_end) }
    bill_run!([ [ a, oa[:total_minor] ], [ b, 2 * oa[:total_minor] ] ], due_on: today - 3)
    api_post "/api/v1/customers/#{a[:id]}/payments", { amount_minor: oa[:total_minor], method_code: "cash" }, headers: headers
    sale!(a[:id]) # Ali's balance is again Rs 92.80, all of it bought after the bill
    api_post "/api/v1/customers/#{b[:id]}/payments", { amount_minor: oa[:total_minor], method_code: "cash" }, headers: headers # Bilal pays half
    OverdueRemindersJob.perform_now
    within(biz) do
      expect(Customer.find(a[:id]).balance_minor).to eq(oa[:total_minor])
      expect(reminders(a[:id]).count).to eq(0)
      expect(reminders(b[:id]).map { |r| r.variables["text"] }).to contain_exactly(include("3 days overdue", "Balance Rs 92.8"))
    end
  end

  # ledger#5: the hold follows the same rule, so a bill settled any way holds nobody: a payment entered late and dated
  # back into the period, the billed sale refunded to the account, or the bill written off.
  it "lifts the hold for a bill settled by a payment dated into the period, a refund to the account or a write-off" do
    within(biz) { Setting.write!(biz, { "khata.credit_hold_days" => 2 }) }
    people = [ customer!(guardian_phone: nil), customer!(name: "Bilal", phone: "+923001112244", guardian_phone: nil), customer!(name: "Sana", phone: "+923001112255", guardian_phone: nil) ]
    sales = people.map { |c| sale!(c[:id], on: last_month_end) }
    bill_run!(people.zip(sales).map { |c, o| [ c, o[:total_minor] ] }, due_on: today - 5)
    expect(people.map { |c| try_khata(c[:id]) }).to eq([ 409, 409, 409 ])

    a, b, c = people
    api_post "/api/v1/customers/#{a[:id]}/payments", { amount_minor: sales[0][:total_minor], method_code: "bank", reference: "IBFT 77", received_on: last_month_end.to_s }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders/#{sales[1][:id]}/refunds", { amount_minor: sales[1][:total_minor], method_code: "khata", reason: "Cold chai" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/customers/#{c[:id]}/adjustments", { kind: "adjustment", amount_minor: -sales[2][:total_minor], reason: "Written off" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect([ a, b, c ].map { |x| try_khata(x[:id]) }).to eq([ 201, 201, 201 ])
  end

  # K12: a business that prints its bills sends no bill runs. Its bills follow the monthly cycle in the settings, the
  # hold works without WhatsApp, and the reminder goes once per period.
  it "holds credit and reminds by the monthly cycle when no bill run was ever made" do
    travel_to(Time.find_zone("Asia/Karachi").local(2026, 11, 20, 13)) do
      within(biz) { Setting.write!(biz, { "khata.credit_hold_days" => 5, "khata.overdue.remind_after_days" => 3, "khata.monthly_bills.day" => 1, "khata.monthly_bills.due_days" => 10 }) }
      a = customer!(guardian_phone: nil)
      b = customer!(name: "Bilal", phone: "+923001112244", guardian_phone: nil)
      sale!(a[:id], on: Date.new(2026, 10, 20))
      sale!(b[:id], on: Date.new(2026, 11, 5)) # on November's bill, due 11 Dec
      expect(within(biz) { BillRun.count }).to eq(0)
      expect(try_khata(a[:id])).to eq(409)
      expect(json[:error][:message]).to include("October 2026", "9 days overdue") # October's bill was due on 11 Nov
      expect(try_khata(b[:id])).to eq(201)

      allow(Whatsapp::Provider).to receive(:live?).and_return(true)
      2.times { OverdueRemindersJob.perform_now }
      within(biz) do
        expect(reminders(a[:id]).map { |r| r.variables["text"] }).to contain_exactly(include("October 2026", "11 Nov 2026", "9 days overdue"))
        expect(reminders(b[:id]).count).to eq(0)
      end
    end
  end

  it "keeps a bill link alive for more than a year" do
    a = customer!
    token = within(biz) { Customers::BillToken.generate(Customer.find(a[:id]), from: today - 30, to: today) }
    travel_to(390.days.from_now) { expect(Customers::BillToken.read(token)).to include(customer_id: a[:id]) }
    travel_to(410.days.from_now) { expect(Customers::BillToken.read(token)).to be_nil }
  end
end

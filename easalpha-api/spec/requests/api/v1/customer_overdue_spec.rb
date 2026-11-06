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

  def sale!(cid)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cid, lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: o[:total_minor] } ] }, headers: headers
    o
  end

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
    expect(accounts["khata.overdue.remind_after_days"]).to include(type: "integer", value: 3)
    expect(accounts["khata.credit_hold_days"]).to include(type: "integer", value: 0)
    pos = json[:groups][:point_of_sale][:screens][:"Order Behavior"].index_by { |k| k[:key] }
    expect(pos["pos.lock_minutes"]).to include(type: "integer", value: 5)
  end

  it "reminds a customer once per bill run after the set days, customer and guardian alike, and skips small balances and bills not yet due" do
    a = customer!
    b = customer!(name: "Bilal", phone: "+923001112244", guardian_phone: nil)
    c = customer!(name: "Sana", phone: "+923001112255", guardian_phone: nil)
    sale!(a[:id])
    sale!(b[:id])
    within(biz) { Customer.find(c[:id]).update_columns(balance_minor: 50) } # below the Rs 1 minimum
    run = bill_run!([ [ a, 9_280 ], [ b, 9_280 ], [ c, 50 ] ], due_on: today - 3)
    bill_run!([ [ b, 9_280 ] ], due_on: today - 1, period_to: today - 2) # Bilal's newer bill is not yet 3 days overdue

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
    sale!(d[:id])
    bill_run!([ [ d, 9_280 ] ], due_on: today - 10, period_to: today - 20)
    OverdueRemindersJob.perform_now
    within(biz) { expect(reminders(d[:id]).count).to eq(0) }
  end

  it "holds new sales on account while the latest bill is overdue beyond the setting, until it is paid" do
    a = customer!
    o = sale!(a[:id])
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

  it "keeps a bill link alive for more than a year" do
    a = customer!
    token = within(biz) { Customers::BillToken.generate(Customer.find(a[:id]), from: today - 30, to: today) }
    travel_to(390.days.from_now) { expect(Customers::BillToken.read(token)).to include(customer_id: a[:id]) }
    travel_to(410.days.from_now) { expect(Customers::BillToken.read(token)).to be_nil }
  end
end

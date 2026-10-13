require "rails_helper"

# Bills (13 Oct 2026): a period's statement from a balance brought forward summed in SQL plus only the period's rows,
# with the same numbers as replaying the whole history; bill runs that need a connected WhatsApp, count a bill as sent
# only when its message is queued, save each result as they go and are carried on after a restart; the month-end
# catch-up; and phone cells that Excel changed in an import.
RSpec.describe "Customer bills", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }
  let(:today) { today_for(biz) }
  let(:zone) { within(biz) { Branch.first.time_zone } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def at(day, hour = 12) = Time.find_zone(zone).parse("#{day} #{hour}:00")

  def customer!(attrs = {})
    api_post "/api/v1/customers", { name: "Ali Raza", phone: "+923001112233", member_no: "R-12" }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def sale!(cid, qty, method_code: "khata")
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cid, lines: [ { product_id: m[:chai].id, quantity: qty } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: method_code, amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  # A sale on account, dated to a business day and an hour.
  def charge!(cid, day, hour, qty, method_code: "khata")
    o = sale!(cid, qty, method_code: method_code)
    within(biz) { Payment.where(order_id: o[:id]).update_all(business_day: day, received_at: at(day, hour)) }
    o
  end

  def refund!(order, amount, day, hour, method_code: "khata")
    api_post "/api/v1/orders/#{order[:id]}/refunds", { amount_minor: amount, method_code: method_code, reason: "Tea was cold" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    id = json[:refund][:id]
    within(biz) { Refund.where(id: id).update_all(business_day: day, refunded_at: at(day, hour)) }
    id
  end

  def pay!(cid, amount, day, hour, direction: "received")
    api_post "/api/v1/customers/#{cid}/payments", { amount_minor: amount, method_code: "cash", direction: direction }, headers: headers
    expect(response).to have_http_status(:created), response.body
    id = json[:payment][:id]
    within(biz) { CustomerPayment.where(id: id).update_all(business_day: day, received_at: at(day, hour)) }
    id
  end

  def adjust!(cid, amount, day)
    api_post "/api/v1/customers/#{cid}/adjustments", { kind: "adjustment", amount_minor: amount, reason: "Correction #{amount}", effective_on: day.to_s }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json[:adjustment]
  end

  # Reversals are dated the day they are entered, so travel there.
  def reverse!(adj, day)
    travel_to(at(day)) do
      within(biz) { Customers::Accounts.reverse!(CustomerAdjustment.find(adj[:id]), reason: "Entered by mistake", actor: owner, branch: Branch.first) }
    end
  end

  # The statement as replaying the whole history gives it: the reference the period statement must match.
  def replayed(customer, from, to)
    all = Customers::Ledger.entries(customer)
    before = all.select { |e| e[:date] < from }
    inside = all.select { |e| e[:date] >= from && e[:date] <= to }
    opening = before.last&.dig(:balance_minor) || 0
    { from: from, to: to, brought_forward_minor: opening, closing_balance_minor: inside.last&.dig(:balance_minor) || opening, entries: inside, totals: Customers::Ledger.totals(inside) }
  end

  describe "statement for a period" do
    it "brings the balance forward and lists only the period's rows, with the same numbers as the whole history" do
      f = today - 60
      t = f + 29
      s = customer!(opening_balance_minor: 100_000, opening_on: (f - 40).to_s)
      cid = s[:id]
      other = customer!(name: "Bilal", phone: "+923004445566", member_no: "R-40")

      # Before the period.
      c1 = charge!(cid, f - 20, 10, 1)
      a1 = adjust!(cid, -5_000, f - 15)
      pay!(cid, 30_000, f - 10, 11)
      refund!(c1, 4_000, f - 5, 12)
      pay!(cid, 2_500, f - 3, 13, direction: "paid")
      c2 = charge!(cid, f - 1, 23, 2)
      # Inside it: the first day, three rows on one day in time order, an adjustment reversed after the period, money
      # paid out, a reversal of an older adjustment and the last day.
      c3 = charge!(cid, f, 9, 3)
      c4 = charge!(cid, f + 2, 10, 4)
      refund!(c4, 3_000, f + 2, 12)
      p2 = pay!(cid, 20_000, f + 2, 18)
      a2 = adjust!(cid, 7_500, f + 4)
      pay!(cid, 1_000, f + 6, 14, direction: "paid")
      reverse!(a1, f + 9)
      c5 = charge!(cid, t, 20, 5)
      # Not on account: a cash sale with a cash refund, a voided khata payment, and another customer's sale.
      cash = charge!(cid, f + 3, 15, 1, method_code: "cash")
      refund!(cash, 1_000, f + 3, 16, method_code: "cash")
      voided = charge!(cid, f + 5, 15, 1)
      within(biz) { Payment.where(order_id: voided[:id]).update_all(status: "voided") }
      theirs = charge!(other[:id], f + 1, 9, 2)
      # After the period.
      c6 = charge!(cid, t + 1, 9, 6)
      pay!(cid, 10_000, t + 3, 10)
      reverse!(a2, today)

      opening = 100_000 + c1[:total_minor] - 5_000 - 30_000 - 4_000 + 2_500 + c2[:total_minor]
      lines = [
        [ "charge", f, c3[:total_minor] ], [ "charge", f + 2, c4[:total_minor] ], [ "refund", f + 2, -3_000 ], [ "payment", f + 2, -20_000 ],
        [ "adjustment", f + 4, 7_500 ], [ "paid_out", f + 6, 1_000 ], [ "reversal", f + 9, 5_000 ], [ "charge", t, c5[:total_minor] ]
      ]
      running = lines.each_with_object([]) { |(_, _, amount), acc| acc << (acc.last || opening) + amount }
      closing = running.last

      cust = within(biz) { Customer.find(cid) }
      st = within(biz) { Customers::Ledger.statement(cust, from: f, to: t) }
      expect(st[:brought_forward_minor]).to eq(opening)
      expect(st[:entries].map { |e| [ e[:kind], e[:date], e[:amount_minor] ] }).to eq(lines)
      expect(st[:entries].map { |e| e[:balance_minor] }).to eq(running)
      expect(st[:closing_balance_minor]).to eq(closing)
      expect(st[:totals]).to eq(charges_minor: c3[:total_minor] + c4[:total_minor] + c5[:total_minor], payments_minor: 20_000, refunds_minor: 3_000, paid_out_minor: 1_000,
                                adjustments_minor: 12_500)
      expect(st[:entries][0]).to include(order_id: c3[:id], order_label: c3[:label], items: "3x Chai", business_day: f)
      expect(st[:entries][2]).to include(order_id: c4[:id], reason: "Tea was cold")
      expect(st[:entries][3]).to include(ref: p2, method: "cash")
      expect(st[:entries][4]).to include(label: a2[:label], reversed: true)
      expect(st[:entries][6]).to include(reverses_label: a1[:label], reversed: false)

      # Every period gives what replaying the whole history gives: empty, before everything, on the edges, after
      # everything and in the future.
      periods = [ [ f, t ], [ f - 41, f - 41 ], [ f - 40, f - 40 ], [ f - 1, f ], [ f + 2, f + 2 ], [ t, t + 1 ], [ t + 1, today ], [ f - 100, today ], [ today + 1, today + 30 ] ]
      periods.each do |from, to|
        expect(within(biz) { Customers::Ledger.statement(cust, from: from, to: to) }).to eq(within(biz) { replayed(cust, from, to) }), "#{from}..#{to}"
      end

      # The bill, the Bills screen row and the nightly rebuild agree with it.
      bill = within(biz) { Customers::Bill.build(cust, from: f, to: t) }
      expect(bill.slice(:brought_forward_minor, :closing_balance_minor, :totals, :entries)).to eq(st.slice(:brought_forward_minor, :closing_balance_minor, :totals, :entries))
      get "/api/v1/customer_bills", params: { from: f.to_s, to: t.to_s }, headers: headers
      row = json[:rows].find { |r| r[:customer][:id] == cid }
      expect(row).to include(brought_forward_minor: opening, closing_balance_minor: closing, entries_count: 8)
      expect(row[:totals]).to eq(st[:totals])
      expect(json[:rows].find { |r| r[:customer][:id] == other[:id] }).to include(brought_forward_minor: 0, closing_balance_minor: theirs[:total_minor], entries_count: 1)

      total = closing + c6[:total_minor] - 10_000 - 7_500
      expect(within(biz) { Customers::Ledger.entries(cust).last[:balance_minor] }).to eq(total)
      within(biz) do
        Customer.where(id: [ cid, other[:id] ]).update_all(balance_minor: 0)
        expect(Balances::Rebuild.customers!).to eq(2)
        expect(Customer.find(cid).balance_minor).to eq(total)
        expect(Customer.find(other[:id]).balance_minor).to eq(theirs[:total_minor])
        expect(Balances::Rebuild.customers!).to eq(0)
        # Credits (79,500) settle the oldest debit first: what is left of the opening balance is over 90 days old.
        aging = { "over_90" => 20_500, "61_90" => c1[:total_minor] + 2_500 + c2[:total_minor], "31_60" => c3[:total_minor] + c4[:total_minor] + 7_500 + 1_000 + 5_000 + c5[:total_minor],
                  "current" => c6[:total_minor], "total" => total }
        expect(Customers::Ledger.aging(cust, as_of: today)).to eq(aging)
        report = Customers::Ledger.aging_report(as_of: today)
        expect(report[:rows].map { |r| [ r[:customer][:id], r[:aging] ] })
          .to contain_exactly([ cid, aging ], [ other[:id], { "current" => 0, "31_60" => theirs[:total_minor], "61_90" => 0, "over_90" => 0, "total" => theirs[:total_minor] } ])
      end
    end
  end

  describe "bill runs" do
    let(:last_month) { Customers::Bill.last_month(today) }

    def owing!(name, phone, amount, attrs = {})
      customer!({ name: name, phone: phone, member_no: name.upcase, opening_balance_minor: amount }.merge(attrs))
    end

    def bills_sent = within(biz) { WhatsappMessage.where(business_id: biz.id, template_name: "account_bill") }

    it "refuses to send while WhatsApp cannot send, and counts a bill as sent only when its message is queued" do
      a = owing!("Ali", "+923001112233", 40_000)
      b = owing!("Bilal", nil, 25_000)
      c = owing!("Sana", "+923005556677", 10_000)
      from, to = last_month

      # No phone linked (no gateway in tests): nothing is sent, no run is recorded.
      api_post "/api/v1/bill_runs", { from: from.to_s, to: to.to_s }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "whatsapp.not_connected", message: "Link a WhatsApp phone in Settings, then send again.")
      api_post "/api/v1/customers/#{a[:id]}/send_bill", { from: from.to_s, to: to.to_s }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("whatsapp.not_connected")
      within(biz) { Setting.write!(biz, { "whatsapp.provider" => "cloud" }) }
      allow(Whatsapp::Provider).to receive(:cloud?).and_return(false)
      api_post "/api/v1/bill_runs", { from: from.to_s, to: to.to_s }, headers: headers
      expect(json[:error][:message]).to eq("The WhatsApp Cloud API is not set up, so nothing was sent.")
      expect(within(biz) { BillRun.count }).to eq(0)
      expect(bills_sent.count).to eq(0)

      # Linked, then the phone drops after Ali's bill: Sana's message is only logged, so her row failed.
      allow(Whatsapp::Provider).to receive(:live?).and_return(true, true, false)
      api_post "/api/v1/bill_runs", { from: from.to_s, to: to.to_s }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json).to include(status: "done", customers_count: 3, sent_count: 1, failed_count: 1, skipped_count: 1)
      results = json[:results].index_by { |r| r[:customer_id] }
      expect(results[a[:id]]).to include(status: "sent", to: [ "+923001112233" ])
      expect(results[b[:id]]).to include(status: "skipped")
      expect(results[c[:id]]).to include(status: "failed", error: "WhatsApp was not connected, so it was not sent")
      expect(bills_sent.pluck(:customer_id, :status)).to contain_exactly([ a[:id], "queued" ], [ c[:id], "logged" ])
      expect(within(biz) { Notification.find_by(kind: "bill_run").body }).to eq("1 sent, 1 failed, 1 without a phone.")
    end

    it "saves each result as it goes; the month-end job carries on a run cut short and catches up a missed day, once per period" do
      from, to = last_month
      first = owing!("Ali", "+923001112233", 40_000)
      second = owing!("Bilal", "+923004445566", 25_000)
      third = owing!("Sana", "+923005556677", 10_000)
      bom = today.beginning_of_month
      travel_to(at(bom - 1)) { within(biz) { Setting.write!(biz, { "khata.monthly_bills.enabled" => true, "khata.monthly_bills.day" => 3 }) } }

      # The bill day comes while no phone is linked: nothing goes out, and the owner hears once.
      within(biz) do
        Customers::Bills.monthly!(biz.reload, today: bom + 2)
        Customers::Bills.monthly!(biz.reload, today: bom + 3)
        expect(BillRun.count).to eq(0)
        expect(Notification.where(kind: "bill_run").pluck(:title)).to eq([ "Bills for #{from.strftime('%B %Y')} are waiting for WhatsApp" ])
      end

      # Two days late the phone is linked; the server restarts after the first bill.
      allow(Whatsapp::Provider).to receive(:live?).and_return(true)
      cut = stub_const("CutShort", Class.new(Exception)) # like a restart: not an error the run can rescue
      cutting = true
      allow(Customers::Notify).to receive(:bill!).and_wrap_original do |original, customer, **kw|
        raise cut if cutting && customer.id == second[:id]
        original.call(customer, **kw)
      end
      within(biz) do
        expect { Customers::Bills.monthly!(biz.reload, today: bom + 4) }.to raise_error(cut)
        run = BillRun.sole
        expect(run).to have_attributes(trigger: "auto", status: "running", period_from: from, period_to: to, customers_count: 1, sent_count: 1)
        expect(run.results.map { |r| r["customer_id"] }).to eq([ first[:id] ])

        # Still fresh: the job leaves it alone. Ten minutes without progress: the job carries it on.
        cutting = false
        Customers::Bills.monthly!(biz.reload, today: bom + 4)
        expect(run.reload.status).to eq("running")
        travel 11.minutes
        Customers::Bills.monthly!(biz.reload, today: bom + 5)
        expect(run.reload).to have_attributes(status: "done", customers_count: 3, sent_count: 3, failed_count: 0)
        expect(run.results.map { |r| r["customer_id"] }).to eq([ first[:id], second[:id], third[:id] ])

        Customers::Bills.monthly!(biz.reload, today: bom + 6)
        expect(BillRun.count).to eq(1)
        expect(Notification.where(kind: "bill_run", title: "Bills for #{from.strftime('%B %Y')} sent automatically").count).to eq(1)
      end
      expect(bills_sent.group(:customer_id).count).to eq(first[:id] => 1, second[:id] => 1, third[:id] => 1)
      MonthlyBillsJob.perform_now
      expect(within(biz) { BillRun.count }).to eq(1)
    end

    it "does not count a bill day before monthly bills were switched on as missed: the first bills go out next month" do
      owing!("Ali", "+923001112233", 40_000)
      bom = today.beginning_of_month
      travel_to(at(bom + 4)) { within(biz) { Setting.write!(biz, { "khata.monthly_bills.enabled" => true, "khata.monthly_bills.day" => 3 }) } }
      allow(Whatsapp::Provider).to receive(:live?).and_return(true)
      within(biz) do
        Customers::Bills.monthly!(biz.reload, today: bom + 5)
        expect(BillRun.count).to eq(0)
        Customers::Bills.monthly!(biz.reload, today: bom.next_month + 2)
        expect(BillRun.sole).to have_attributes(trigger: "auto", period_from: bom, period_to: bom.end_of_month, sent_count: 1)
      end
    end
  end

  describe "import phones" do
    it "takes a mobile number that lost its leading 0 and explains a number Excel turned into 9.23001E+11" do
      csv = <<~CSV
        name,phone,roll_no,guardian_phone
        Ali Raza,3001112233,R-12,3009998877
        Sana Khan,9.23001E+11,R-13,
        Hamza Ali,03005556677,R-14,9.23009E+11
        Bilal Ahmed,923004445566,R-15,
      CSV
      api_post "/api/v1/customers/import", { data: csv }, headers: headers
      expect(json).to include(created: 2, updated: 0)
      expect(json[:error_rows]).to eq([ { line: 3, error: "Excel changed this phone into a number; format the phone columns as Text" },
                                        { line: 4, error: "Excel changed this phone into a number; format the phone columns as Text" } ])
      expect(within(biz) { Customer.find_by(member_no: "R-12") }).to have_attributes(phone: "+923001112233", guardian_phone: "+923009998877")
      expect(within(biz) { Customer.find_by(member_no: "R-15").phone }).to eq("+923004445566")
      expect(within(biz) { Customer.where(member_no: %w[R-13 R-14]).count }).to eq(0)

      # Saved again from Excel: the same customer is found by the phone.
      api_post "/api/v1/customers/import", { data: "name,phone,room\nAli Raza,3001112233,7\n" }, headers: headers
      expect(json).to include(created: 0, updated: 1, error_rows: [])
      expect(within(biz) { Customer.find_by(member_no: "R-12").room }).to eq("7")
    end
  end
end

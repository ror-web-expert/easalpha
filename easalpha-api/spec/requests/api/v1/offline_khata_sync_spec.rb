require "rails_helper"

# Found on 18 Oct 2026 on the desktop till: a khata sale taken offline for a regular customer came back from the sync
# as "payment.overpaid" and the order sat in admin as Pending / Unpaid. The till charged the full price; the server
# took off the customer's regular discount when the order arrived, so the khata payment was more than it asked for.
# The order had already been saved, so Try again only answered "duplicate" and the payment was never taken.
RSpec.describe "Offline khata sales reaching the server", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T2") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:customer) { within(biz) { Customer.create!(name: "Sadia Akhtar", khata_no: 32, phone: "+923001807130", last_order_at: 1.day.ago) } }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_patch "/api/v1/business", { settings: biz.reload.settings.merge("modules.customer_accounts" => true) }, headers: headers
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: headers
  end

  # Two burgers at Rs 450 plus 16% tax, as a till that did not know about the regular discount priced them.
  let(:full_price) { 104_400 }

  def order_record(id, payments:, created_at: 10.minutes.ago)
    { type: "order", id: id, membership_id: cashier.id,
      payload: { order_type: "takeaway", till_serial: "T2-015", client_created_at: created_at.iso8601, status: "placed", customer_id: customer.id,
                 lines: [ { product_id: m[:burger].id, quantity: 2 } ], payments: payments } }
  end

  it "records the sale as paid at the server's total and puts that on the customer's account" do
    order_id = SecureRandom.uuid
    pay_id = SecureRandom.uuid
    api_post "/api/v1/sync/push", { records: [ order_record(order_id, payments: [ { id: pay_id, method_code: "khata", amount_minor: full_price } ]) ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "accepted")
    within(biz) do
      o = Order.find(order_id)
      expect(o.discounts.map(&:kind)).to eq([ "regular" ])
      expect(o.total_minor).to be < full_price
      expect(o).to have_attributes(status: "paid", payment_status: "paid", paid_minor: o.total_minor)
      expect(Payment.find(pay_id).amount_minor).to eq(o.total_minor)
      expect(customer.reload.balance_minor).to eq(o.total_minor)
      log = AuditLog.where(action: "offline_payment_adjusted", record_id: order_id).sole
      expect(log.before).to include("method_code" => "khata", "amount_minor" => full_price)
      expect(log.after).to include("amount_minor" => o.total_minor)
      expect(SyncRejection.count).to eq(0)
    end
  end

  it "takes the missing payment when an order that is already on the server is sent again (Try again)" do
    order_id = SecureRandom.uuid
    # The order reached the server, its payment did not: what the old code left behind.
    api_post "/api/v1/sync/push", { records: [ order_record(order_id, payments: []) ] }, headers: device_headers(device)
    within(biz) { expect(Order.find(order_id)).to have_attributes(status: "placed", payment_status: "unpaid") }

    record = order_record(order_id, payments: [ { id: SecureRandom.uuid, method_code: "khata", amount_minor: full_price } ])
    api_post "/api/v1/sync/push", { records: [ record ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "accepted")
    within(biz) do
      o = Order.find(order_id)
      expect(o).to have_attributes(status: "paid", payment_status: "paid", paid_minor: o.total_minor)
      expect(customer.reload.balance_minor).to eq(o.total_minor)
    end

    api_post "/api/v1/sync/push", { records: [ record ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "duplicate")
    within(biz) { expect(Payment.where(order_id: order_id).count).to eq(1) }
  end

  it "skips a payment that finds nothing left to pay instead of refusing the sale" do
    order_id = SecureRandom.uuid
    payments = [ { id: SecureRandom.uuid, method_code: "khata", amount_minor: full_price }, { id: SecureRandom.uuid, method_code: "khata", amount_minor: 5_000 } ]
    api_post "/api/v1/sync/push", { records: [ order_record(order_id, payments: payments) ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "accepted")
    within(biz) do
      o = Order.find(order_id)
      expect(o.payment_status).to eq("paid")
      expect(Payment.where(order_id: order_id).count).to eq(1)
      expect(AuditLog.where(action: "offline_payment_adjusted", record_id: order_id).count).to eq(2)
    end
  end

  it "still refuses an online payment above the amount due" do
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer.id, lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: full_price } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code] || json[:code]).to eq("payment.overpaid")
  end

  it "counts the customer's recency to the time of sale, not to when the till came back online" do
    within(biz) { customer.update!(last_order_at: 5.days.ago) }
    order_id = SecureRandom.uuid
    # Sold 4 days ago, one day after the last order: within the 3-day tier then, though not any more.
    api_post "/api/v1/sync/push", { records: [ order_record(order_id, payments: [], created_at: 4.days.ago) ] }, headers: device_headers(device)
    within(biz) { expect(Order.find(order_id).discounts.map(&:kind)).to eq([ "regular" ]) }
  end

  it "keeps a service charge the cashier removed offline, so the khata payment still settles the order" do
    within(biz) { Setting.write!(biz, { "charges.service_charge.value" => 5, "charges.service_charge.order_types" => [ "dine_in" ] }) }
    within(biz) { expect(Orders::Builder.default_charges("dine_in", biz.reload)[:service_charge_percent].to_d).to eq(5) } # the default the cashier took off
    manager = add_member!(biz, "manager", pin: "2222")
    order_id = SecureRandom.uuid
    # Removed on the till: 10% regular discount, no service charge, 16% tax on Rs 810 = Rs 939.60 (specs keep paisa).
    record = { type: "order", id: order_id, membership_id: manager.id,
               payload: { order_type: "dine_in", client_created_at: 5.minutes.ago.iso8601, status: "placed", customer_id: customer.id, service_charge_percent: 0, service_charge_fixed_minor: 0,
                          lines: [ { product_id: m[:burger].id, quantity: 2 } ], payments: [ { id: SecureRandom.uuid, method_code: "khata", amount_minor: 93_960 } ] } }
    api_post "/api/v1/sync/push", { records: [ record ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "accepted")
    within(biz) do
      o = Order.find(order_id)
      expect(o).to have_attributes(service_charge_minor: 0, total_minor: 93_960, payment_status: "paid")
      expect(AuditLog.where(action: "offline_payment_adjusted", record_id: order_id)).to be_empty
    end
  end

  it "gives each restaurant's till only its own customers and tiers, and refuses another restaurant's customer" do
    customer
    other_owner = signup_business(name: "Other Canteen")
    other = other_owner.business
    other_device = within(other) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T1") }
    stranger = within(other) { Customer.create!(name: "Sadia From Other Canteen", khata_no: 32, phone: "+923001807130", last_order_at: 1.day.ago) }
    within(other) { RegularDiscountTier.create!(name: "Other tier", within_days: 30, kind: "percent", value: 50) }

    get "/api/v1/sync/customers", headers: device_headers(device)
    expect(json[:data].map { |c| c[:id] }).to eq([ customer.id ])
    get "/api/v1/sync/customers", headers: device_headers(other_device)
    expect(json[:data].map { |c| c[:id] }).to eq([ stranger.id ])

    get "/api/v1/sync/changes", headers: device_headers(device)
    expect(json[:customers].map { |c| c[:id] }).not_to include(stranger.id)
    expect(json[:regular_discount_tiers].map { |t| t[:name] }).to eq([ "Back within 3 days" ])
    get "/api/v1/catalog", headers: device_headers(other_device)
    expect(json[:regular_discount_tiers].map { |t| t[:name] }).to eq([ "Other tier" ])

    # A till cannot page into another restaurant's list either: the cursor is only an id to start after.
    get "/api/v1/sync/customers?after=00000000-0000-0000-0000-000000000000", headers: device_headers(device)
    expect(json[:data].map { |c| c[:id] }).to eq([ customer.id ])

    # An offline sale naming the other restaurant's customer is refused and nothing is charged to anyone.
    order_id = SecureRandom.uuid
    record = order_record(order_id, payments: [ { id: SecureRandom.uuid, method_code: "khata", amount_minor: full_price } ])
    record[:payload][:customer_id] = stranger.id
    api_post "/api/v1/sync/push", { records: [ record ] }, headers: device_headers(device)
    expect(json[:results].first).to include(status: "rejected")
    within(other) { expect(stranger.reload.balance_minor).to eq(0) }
    within(biz) { expect(Order.where(id: order_id)).to be_empty }
  end

  it "gives the till the tiers and every customer it can search offline" do
    customer
    walk_in = within(biz) { Customer.walk_in }
    gone = within(biz) { Customer.create!(name: "Old Student") }
    get "/api/v1/catalog", headers: device_headers(device)
    expect(json[:regular_discount_tiers].map { |t| t[:within_days] }).to eq([ 3 ])
    get "/api/v1/sync/changes", headers: device_headers(device)
    expect(json[:regular_discount_tiers].first).to include(kind: "percent", value: 10.0)
    cursor = json[:cursor]
    within(biz) { gone.update!(archived_at: Time.current) }
    get "/api/v1/sync/changes?since=#{cursor}", headers: device_headers(device)
    expect(json[:archived_customer_ids]).to eq([ gone.id ])

    get "/api/v1/sync/customers?limit=1", headers: device_headers(device)
    first_page = json[:data].map { |c| c[:id] }
    expect(first_page.size).to eq(1)
    get "/api/v1/sync/customers?limit=1&after=#{json[:next_after]}", headers: device_headers(device)
    ids = first_page + json[:data].map { |c| c[:id] }
    get "/api/v1/sync/customers", headers: device_headers(device)
    expect(json[:data].map { |c| c[:id] }).to match_array([ customer.id ])
    expect(json[:next_after]).to be_nil
    expect(ids).not_to include(walk_in.id, gone.id)
    expect(json[:data].first).to include(name: "Sadia Akhtar", khata_no: 32, last_order_at: be_present, is_walk_in: false)
  end
end

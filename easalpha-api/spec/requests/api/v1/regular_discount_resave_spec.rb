require "rails_helper"

# Found on 13 Oct 2026 on the till: a regular customer's order showed "Paid Rs 1,253, Due Rs 0" but stayed open as a
# part payment. The till saves the order when Pay opens (the server adds the regular discount: 10% of Rs 1,200 =
# Rs 120) and again when Pay is pressed; the second save worked the discount out from the already-discounted amount
# (10% of Rs 1,080 = Rs 108), so the server's total rose by Rs 13.92 after the till had taken the money.
RSpec.describe "Regular discount on an order saved again", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: headers
  end

  it "keeps the same discount however often the order is saved, so paying the shown total completes it" do
    cust = within(biz) { Customer.create!(name: "Sana Farooq", last_order_at: 1.day.ago) }
    lines = [ { product_id: m[:burger].id, quantity: 2 } ]
    api_post "/api/v1/orders", { order_type: "walk_in", customer_id: cust.id, lines: lines }, headers: headers # Pay opens: draft with the discount
    first = json
    reg = first[:discounts].find { |d| d[:kind] == "regular" }
    expect(reg[:amount_minor]).to eq((first[:subtotal_minor] * 0.10).round)
    shown_total = first[:total_minor]

    line_ids = first[:items].map { |i| i[:id] }
    3.times do # Pay pressed (and any later edits): the till saves the same lines again
      api_patch "/api/v1/orders/#{first[:id]}", { customer_id: cust.id, lines: [ { id: line_ids.first, product_id: m[:burger].id, quantity: 2 } ] }, headers: headers
      expect(response).to have_http_status(:ok), response.body[0, 300]
      expect(json[:discounts].find { |d| d[:kind] == "regular" }[:amount_minor]).to eq(reg[:amount_minor])
      expect(json[:total_minor]).to eq(shown_total)
    end

    api_post "/api/v1/orders/#{first[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: shown_total, tendered_minor: shown_total } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:order]).to include(payment_status: "paid", paid_minor: shown_total)
  end

  it "still bases the discount on the price after the product's own discount" do
    within(biz) { m[:burger].update!(discount_type: "percent", discount_value: 20) }
    cust = within(biz) { Customer.create!(name: "Ali", last_order_at: 1.day.ago) }
    api_post "/api/v1/orders", { order_type: "walk_in", customer_id: cust.id, lines: [ { product_id: m[:burger].id, quantity: 1 } ] }, headers: headers
    o = json
    after_product = o[:subtotal_minor] - (o[:subtotal_minor] * 0.20).round
    expect(o[:discounts].find { |d| d[:kind] == "regular" }[:amount_minor]).to eq((after_product * 0.10).round)
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: cust.id, lines: [ { id: o[:items].first[:id], product_id: m[:burger].id, quantity: 1 } ] }, headers: headers
    expect(json[:discounts].find { |d| d[:kind] == "regular" }[:amount_minor]).to eq((after_product * 0.10).round)
  end
end

RSpec.describe "Repairing orders hit by the regular-discount bug", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: headers
  end

  it "puts the right discount back on a stuck order, completes it as paid, and never touches a paid order" do
    cust = within(biz) { Customer.create!(name: "Sana Farooq", last_order_at: 1.day.ago) }
    api_post "/api/v1/orders", { order_type: "walk_in", customer_id: cust.id, lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: headers
    o = json
    right_total = o[:total_minor]
    reg = o[:discounts].find { |d| d[:kind] == "regular" }
    # The old bug: a second save shrank the discount by 10%, raising the total after the till had taken the money.
    within(biz) do
      order = Order.find(o[:id])
      d = order.discounts.find { |x| x.kind == "regular" }
      d.update!(value: BigDecimal((reg[:amount_minor] * 0.9).round.to_s) / 100)
      order.discounts.reset
      Orders::Pricing.recalculate!(order)
      Orders::Pricing.save_all!(order)
    end
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: right_total, tendered_minor: right_total } ] }, headers: headers
    expect(json[:order][:payment_status]).to eq("partial") # stuck: "Due Rs 0" on the till, open on the server

    paid_ok = nil
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id, quantity: 1 } ], place: true }, headers: headers
    paid_ok = json
    api_post "/api/v1/orders/#{paid_ok[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: paid_ok[:total_minor], tendered_minor: paid_ok[:total_minor] } ] }, headers: headers

    within(biz) do
      dry = Orders::RegularDiscountRepair.run!(dry_run: true)
      expect(dry.map { |r| r[:order_id] }).to eq([ o[:id] ])
      expect(Order.find(o[:id]).payment_status).to eq("partial") # a dry run writes nothing
      rows = Orders::RegularDiscountRepair.run!(dry_run: false)
      expect(rows.first).to include(discount_now: reg[:amount_minor], action: "corrected and completed as paid")
      order = Order.find(o[:id])
      expect(order).to have_attributes(status: "paid", payment_status: "paid", total_minor: right_total, paid_minor: right_total)
      expect(order.receipt_number).to be_present
      expect(Orders::RegularDiscountRepair.run!(dry_run: false)).to eq([]) # nothing left to repair
      expect(Order.find(paid_ok[:id]).status).to eq("paid")
    end
  end
end

require "rails_helper"

# orders:repair_regular_discounts runs on live data, so it must work the discount out exactly as the till does: tier
# exclusions, the rules that stop the discount, Pricing's cap and cash rounding. An order that is already right is
# never listed, and one odd order never stops the run.
RSpec.describe "Repairing regular discounts on open orders", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }
  let(:cust) { within(biz) { Customer.create!(name: "Sana Farooq", last_order_at: 1.day.ago) } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def tier!(attrs = {})
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }.merge(attrs), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def order!(lines, order_type: "walk_in")
    api_post "/api/v1/orders", { order_type: order_type, customer_id: cust.id, lines: lines, place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def regular(o) = o[:discounts].find { |d| d[:kind] == "regular" }

  # The old bug, then the till taking the money: a second save shrank the regular discount by a tenth, so the server's
  # total rose above what the till charged and the order stayed open as a part payment.
  def stuck!(o, pay_minor: o[:total_minor])
    within(biz) do
      order = Order.find(o[:id])
      d = order.discounts.find { |x| x.kind == "regular" }
      d.update!(value: BigDecimal((regular(o)[:amount_minor] * 0.9).round.to_s) / 100)
      order.discounts.reset
      Orders::Pricing.recalculate!(order)
      Orders::Pricing.save_all!(order)
    end
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: pay_minor, tendered_minor: pay_minor } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:order][:payment_status]).to eq("partial")
  end

  def repair(dry_run: true) = within(biz) { Orders::RegularDiscountRepair.run!(dry_run: dry_run) }
  def stored(id) = within(biz) { Order.find(id).then { |o| { status: o.status, payment_status: o.payment_status, total_minor: o.total_minor, paid_minor: o.paid_minor, regular_minor: o.discounts.find { |d| d.kind == "regular" }&.amount_minor } } }

  [ [ "product", ->(m) { { excluded_product_ids: [ m[:chai].id ] } } ], [ "category", ->(m) { { excluded_category_ids: [ m[:chai].category_id ] } } ] ].each do |what, exclusion|
    it "works the discount out without the tier's excluded #{what}, leaves a correct order alone and completes a stuck one" do
      tier!(exclusion.call(m))
      lines = [ { product_id: m[:burger].id, quantity: 2 }, { product_id: m[:chai].id, quantity: 1 } ]
      fine = order!(lines)
      expect(regular(fine)[:amount_minor]).to eq(9_000) # 10% of the burgers only, not the Rs 80 chai
      hit = order!(lines)
      stuck!(hit)
      before_fine = stored(fine[:id])

      dry = repair
      expect(dry.map { |r| r[:order_id] }).to eq([ hit[:id] ])
      expect(dry.first).to include(discount_now: 9_000, total_now: hit[:total_minor], action: "would correct and complete as paid")
      expect(stored(hit[:id])).to include(payment_status: "partial") # a dry run writes nothing

      rows = repair(dry_run: false)
      expect(rows.map { |r| r[:order_id] }).to eq([ hit[:id] ])
      expect(stored(hit[:id])).to eq(status: "paid", payment_status: "paid", total_minor: hit[:total_minor], paid_minor: hit[:total_minor], regular_minor: 9_000)
      expect(stored(fine[:id])).to eq(before_fine)
      expect(repair(dry_run: false)).to eq([])
    end
  end

  it "leaves an order alone while the till would not give the discount now, and lists it again once it would" do
    t = tier!
    o = order!([ { product_id: m[:burger].id, quantity: 2 } ], order_type: "takeaway")
    stuck!(o)
    expect(repair.map { |r| r[:order_id] }).to eq([ o[:id] ])

    within(biz) { Setting.write!(biz, { "marketing.regular_discounts.enabled" => false }) }
    expect(repair).to eq([])
    within(biz) { Setting.write!(biz, { "marketing.regular_discounts.enabled" => true, "marketing.regular_discounts.blocked_customer_ids" => [ cust.id ] }) }
    expect(repair).to eq([])
    within(biz) { Setting.write!(biz, { "marketing.regular_discounts.blocked_customer_ids" => [] }) }
    api_patch "/api/v1/regular_discount_tiers/#{t[:id]}", { excluded_order_types: [ "takeaway" ] }, headers: headers
    expect(repair).to eq([])
    api_patch "/api/v1/regular_discount_tiers/#{t[:id]}", { excluded_order_types: [] }, headers: headers
    expect(repair.map { |r| r[:order_id] }).to eq([ o[:id] ])
    api_patch "/api/v1/regular_discount_tiers/#{t[:id]}", { active: false }, headers: headers
    expect(repair).to eq([])
    within(biz) { RegularDiscountTier.find(t[:id]).update!(active: true) }
    delete "/api/v1/regular_discount_tiers/#{t[:id]}", headers: headers # removed tiers are archived
    expect(repair).to eq([])

    before = stored(o[:id])
    expect(repair(dry_run: false)).to eq([])
    expect(stored(o[:id])).to eq(before)
  end

  it "skips an order now below the tier's minimum without stopping the run" do
    t = tier!
    small = order!([ { product_id: m[:burger].id, quantity: 1 } ])
    stuck!(small)
    big = order!([ { product_id: m[:burger].id, quantity: 2 } ])
    stuck!(big)
    api_patch "/api/v1/regular_discount_tiers/#{t[:id]}", { min_order_minor: 50_000 }, headers: headers # Rs 450 of burger is now too little

    before_small = stored(small[:id])
    rows = repair(dry_run: false)
    expect(rows.map { |r| r[:order_id] }).to eq([ big[:id] ])
    expect(stored(big[:id])).to include(status: "paid", total_minor: big[:total_minor], paid_minor: big[:total_minor])
    expect(stored(small[:id])).to eq(before_small)
  end

  it "does not list an order whose discount Pricing caps at what is left of it" do
    tier!
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id, quantity: 2 } ] }, headers: headers
    id = json[:id]
    # The cashier takes Rs 850 off first, then picks the regular: 10% (Rs 90) is more than the Rs 50 left, so Pricing
    # gives the regular discount Rs 50.
    api_post "/api/v1/orders/#{id}/discounts", { kind: "fixed", value: 850, reason: "Manager's guest" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_patch "/api/v1/orders/#{id}", { customer_id: cust.id }, headers: headers
    expect(regular(json)).to include(value: 90.0, amount_minor: 5_000)
    expect(repair).to eq([])

    # The bug's smaller value is capped to the same Rs 50, so putting Rs 90 back changes nothing.
    within(biz) do
      order = Order.find(id)
      order.discounts.find { |d| d.kind == "regular" }.update!(value: 81)
      order.discounts.reset
      Orders::Pricing.recalculate!(order)
      Orders::Pricing.save_all!(order)
    end
    expect(stored(id)[:regular_minor]).to eq(5_000)
    expect(repair).to eq([])
  end

  it "rounds the corrected total to the cash step, as the till did when it took the money" do
    within(biz) { Setting.write!(biz, { "cash_rounding" => 10 }) }
    tier!
    o = order!([ { product_id: m[:burger].id, quantity: 2 } ])
    expect(o[:total_minor]).to eq(93_960) # Rs 900 less 10%, plus 16% tax
    stuck!(o, pay_minor: 94_000) # the till rounded Rs 939.60 to Rs 940; the server rounded its higher total to Rs 950

    expect(repair.first).to include(total_now: 94_000, action: "would correct and complete as paid")
    repair(dry_run: false)
    expect(stored(o[:id])).to eq(status: "paid", payment_status: "paid", total_minor: 94_000, paid_minor: 94_000, regular_minor: 9_000)
  end
end

RSpec.describe "orders:repair_regular_discounts", type: :request do
  before(:all) do
    require "rake"
    Rails.application.load_tasks unless Rake::Task.task_defined?("orders:repair_regular_discounts")
  end

  # A business with one order stuck by the old bug: the till took the right total, the server's total is higher.
  def stuck_business!(name)
    owner = signup_business(name: name)
    biz, h, menu = owner.business, auth_headers(owner), build_menu!(owner.business)
    cust = within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      Customer.create!(name: "Sana Farooq", last_order_at: 1.day.ago)
    end
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: h
    api_post "/api/v1/orders", { order_type: "walk_in", customer_id: cust.id, lines: [ { product_id: menu[:burger].id, quantity: 2 } ], place: true }, headers: h
    o = json
    within(biz) do
      order = Order.find(o[:id])
      order.discounts.find { |d| d.kind == "regular" }.update!(value: 81)
      order.discounts.reset
      Orders::Pricing.recalculate!(order)
      Orders::Pricing.save_all!(order)
    end
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: h
    expect(json[:order][:payment_status]).to eq("partial")
    [ biz, o[:id] ]
  end

  it "completes stuck orders in every business except a deleted one" do
    live, live_order = stuck_business!("Karachi Grill")
    gone, gone_order = stuck_business!("Closed Cafe")
    gone.update!(status: "deleted")
    was = ENV["DRY_RUN"]
    ENV["DRY_RUN"] = "0"
    expect { Rake::Task["orders:repair_regular_discounts"].tap(&:reenable).invoke }.to output(/Karachi Grill .*corrected and completed as paid/m).to_stdout
    expect(within(live) { Order.find(live_order).status }).to eq("paid")
    expect(within(gone) { Order.find(gone_order).status }).to eq("placed")
  ensure
    ENV["DRY_RUN"] = was
  end
end

require "rails_helper"

# The bill from the 17 Oct 2026 frontend review: Seekh Kabab Rs 600 + Chicken Tikka Rs 550, 16% exclusive tax and a 5%
# service charge come to Rs 1,391.50. The total is rounded once, to whole rupees, and every figure after it uses that.
RSpec.describe "Order total rounding", type: :request do
  let!(:owner) { signup_business(whole_rupees: true) }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:kabab) { within(biz) { Product.create!(category: m[:burger].category, name: "Seekh Kabab (4 pcs)", base_price_minor: 60_000, tax_rate: m[:tax]) } }
  let!(:tikka) { within(biz) { Product.create!(category: m[:burger].category, name: "Chicken Tikka", base_price_minor: 55_000, tax_rate: m[:tax]) } }

  before { within(biz) { biz.update!(settings: biz.settings.merge("service_charge_percent" => 5, "service_charge_order_types" => [ "walk_in" ])) } }

  def order!
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: kabab.id }, { product_id: tikka.id } ] }, headers: headers
    expect(response).to have_http_status(:created)
    json
  end

  it "rounds the total to whole rupees by default for PKR and keeps the half rupee in the rounding line, so the bill balances" do
    within(biz) { expect(biz.setting("total_rounding")).to be_nil }
    expect(within(biz) { Orders::Rounding.step_minor(biz) }).to eq(100)
    o = order!
    expect(o).to include(subtotal_minor: 115_000, service_charge_minor: 5_750, tax_minor: 18_400, rounding_minor: 50, total_minor: 139_200)
    expect(o[:subtotal_minor] - o[:discount_minor] + o[:service_charge_minor] + o[:tax_minor] + o[:rounding_minor]).to eq(o[:total_minor])
    expect(o[:items].sum { |i| i[:line_subtotal_minor] }).to eq(o[:subtotal_minor])
  end

  it "takes Rs 1,392 in cash and gives Rs 608 change from Rs 2,000, for every tender" do
    { 140_000 => 800, 150_000 => 10_800, 200_000 => 60_800, 500_000 => 360_800 }.each do |tendered, change|
      o = order!
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 139_200, tendered_minor: tendered } ] }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:created)
      expect(json[:change_minor]).to eq(change)
      expect(tendered - json[:order][:total_minor]).to eq(json[:change_minor])
      expect(json[:order]).to include(status: "paid", paid_minor: 139_200, total_minor: 139_200)
      expect(json[:receipt][:lines].sum { |l| l[:line_subtotal_minor] }).to eq(json[:receipt][:totals][:subtotal_minor])
    end
  end

  it "adds cash rounding to Rs 5 on top, as its own part of the rounding" do
    within(biz) { biz.update!(settings: biz.settings.merge("cash_rounding" => 5)) }
    o = order!
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 139_000, tendered_minor: 200_000 } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:order]).to include(total_minor: 139_000, rounding_minor: -150, cash_rounding_minor: -200, status: "paid")
    expect(json[:change_minor]).to eq(61_000)
    within(biz) { expect(Order.find(o[:id]).tap { |x| Orders::Pricing.recalculate!(x) }.total_minor).to eq(139_000) }
  end

  it "keeps paisa when the business sets total rounding to 0, and the till gets the step in its settings" do
    within(biz) { Setting.write!(biz, { "total_rounding" => 0 }) }
    expect(order!).to include(total_minor: 139_150, rounding_minor: 0)
    within(biz) { Setting.write!(biz, { "total_rounding" => 10 }) }
    expect(order!).to include(total_minor: 139_000, rounding_minor: -150)
    get "/api/v1/catalog", headers: auth_headers(owner)
    expect(json.dig(:business, :settings, :total_rounding_minor)).to eq(1_000)
  end

  it "re-rounds when a tip changes the total" do
    o = order!
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "card", amount_minor: 140_200, reference: "4242" } ], tip_minor: 1_000 }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:order]).to include(tip_minor: 1_000, total_minor: 140_200, rounding_minor: 50, status: "paid")
  end
end

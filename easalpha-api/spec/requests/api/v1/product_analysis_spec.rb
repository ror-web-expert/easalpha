require "rails_helper"

RSpec.describe "Product analysis", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  # Chicken Rs 500/kg (50 minor per g), buns Rs 25, boxes Rs 15, received into Kitchen so every item carries an average cost.
  def seed_stock!
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      g, kg, pcs = %w[g kg pcs].map { |c| Unit.find_by!(code: c) }
      chicken = StockItem.create!(name: "Chicken", sku: "CHK", base_unit: g, purchase_unit: kg)
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      box = StockItem.create!(name: "Box", sku: "BOX", base_unit: pcs, is_packaging: true)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [
        { stock_item_id: chicken.id, unit_id: kg.id, quantity: 20, unit_cost_minor: 50_000 }, { stock_item_id: buns.id, quantity: 100, unit_cost_minor: 2_500 },
        { stock_item_id: box.id, quantity: 100, unit_cost_minor: 1_500 }
      ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      { g: g, pcs: pcs, chicken: chicken, buns: buns, box: box }
    end
  end

  it "prices a serving from the recipe, adds each order type's consumables, and shows nothing for a product without a recipe" do
    s = seed_stock!
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Zinger Burger", yield_qty: 1,
                                  lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:g].id, quantity: 150 }, { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    api_put "/api/v1/products/#{m[:burger].id}/consumables", { rows: [ { order_type: "delivery", stock_item_id: s[:box].id, quantity: 1, unit_id: s[:pcs].id } ] }, headers: headers
    expect(response).to have_http_status(:ok)

    get "/api/v1/products/#{m[:burger].id}/analysis", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:target_percent]).to eq(35.0)
    # The burger sells as its Double variant (Rs 650); the variant has no recipe of its own, so the product's recipe costs it.
    expect(json[:variants].size).to eq(1)
    block = json[:variants].first
    expect(block[:name]).to eq("Double")
    expect(block[:price_minor]).to eq(65_000)
    expect(block[:ingredient_cost_minor]).to eq(10_000) # 150 g chicken at Rs 75 and a Rs 25 bun
    expect(block[:profit_minor]).to eq(55_000)
    expect(block[:margin_percent]).to eq(84.6)
    expect(block[:food_cost_percent]).to eq(15.4)
    expect(block[:over_target]).to be false
    expect(block[:lines].map { |l| [ l[:item_name], l[:cost_minor] ] }).to eq([ [ "Chicken", 7_500 ], [ "Bun", 2_500 ] ])
    delivery = block[:order_types].find { |o| o[:order_type] == "delivery" }
    expect(delivery[:consumables].map { |c| c[:item_name] }).to eq([ "Box" ])
    expect(delivery[:extra_cost_minor]).to eq(1_500)
    expect(delivery[:total_cost_minor]).to eq(11_500)
    expect(delivery[:profit_minor]).to eq(53_500)
    expect(delivery[:margin_percent]).to eq(82.3)
    dine_in = block[:order_types].find { |o| o[:order_type] == "dine_in" }
    expect(dine_in[:extra_cost_minor]).to eq(0)
    expect(dine_in[:profit_minor]).to eq(55_000)

    # the catalogue list carries the same figure, so the grid can show a margin badge
    get "/api/v1/products", headers: headers
    burger = json[:data].find { |p| p[:id] == m[:burger].id }
    expect(burger[:cost]).to include(cost_minor: 10_000, margin_percent: 84.6, over_target: false, variant_name: "Double")
    chai = json[:data].find { |p| p[:id] == m[:chai].id }
    expect(chai[:cost]).to be_nil

    get "/api/v1/products/#{m[:chai].id}/analysis", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:variants].first).to include(name: "Base product", price_minor: 8_000, ingredient_cost_minor: nil, profit_minor: nil, margin_percent: nil)
    expect(json[:variants].first[:lines]).to eq([])
  end

  it "takes a tax-inclusive rate out of the price before working out the profit" do
    s = seed_stock!
    within(biz) { m[:chai].update!(tax_rate: TaxRate.create!(name: "Inclusive 16%", rate: 16, inclusive: true, authority: "pra")) }
    api_post "/api/v1/recipes", { product_id: m[:chai].id, name: "Chai", yield_qty: 1, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/products/#{m[:chai].id}/analysis", headers: headers
    block = json[:variants].first
    expect(block[:price_ex_tax_minor]).to eq(6_897) # Rs 80 with 16% inside it
    expect(block[:profit_minor]).to eq(6_897 - 2_500)
    expect(block[:margin_percent]).to eq(63.8)
  end
end

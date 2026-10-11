require "rails_helper"

RSpec.describe "Recipes and stock deduction", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  # Chicken 20 kg at Rs 500/kg (50 minor per g), buns 100 at Rs 25, oil 10 l at Rs 400/l, boxes 100 at Rs 15, all in Kitchen.
  def seed_stock!
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      g, kg, ml, l, pcs = %w[g kg ml l pcs].map { |c| Unit.find_by!(code: c) }
      chicken = StockItem.create!(name: "Chicken", sku: "CHK", base_unit: g, purchase_unit: kg)
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      oil = StockItem.create!(name: "Oil", sku: "OIL", base_unit: ml, purchase_unit: l)
      box = StockItem.create!(name: "Box", sku: "BOX", base_unit: pcs, is_packaging: true)
      marinade = StockItem.create!(name: "Marinated chicken", sku: "MAR", base_unit: g)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [
        { stock_item_id: chicken.id, unit_id: kg.id, quantity: 20, unit_cost_minor: 50_000 }, { stock_item_id: buns.id, quantity: 100, unit_cost_minor: 2_500 },
        { stock_item_id: oil.id, unit_id: l.id, quantity: 10, unit_cost_minor: 40_000 }, { stock_item_id: box.id, quantity: 100, unit_cost_minor: 1_500 }
      ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      { kitchen: kitchen, g: g, kg: kg, ml: ml, l: l, pcs: pcs, chicken: chicken, buns: buns, oil: oil, box: box, marinade: marinade }
    end
  end

  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity) }

  it "costs a sub-recipe, produces it in a batch, and costs the product recipe with food cost percent" do
    s = seed_stock!
    api_post "/api/v1/recipes", { output_stock_item_id: s[:marinade].id, name: "Marinated chicken", yield_qty: 1, yield_unit_id: s[:kg].id,
                                  lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 1 }, { stock_item_id: s[:oil].id, unit_id: s[:ml].id, quantity: 100, waste_percent: 10 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    sub = json
    expect(sub[:is_sub_recipe]).to be true
    expect(sub[:cost_minor]).to eq(50_000 + 4_400) # 1 kg chicken Rs 500 + 110 ml oil at Rs 0.40
    api_post "/api/v1/production_batches", { recipe_id: sub[:id], quantity: 5 }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:cost_minor]).to eq(272_000)
    expect(json[:document_label]).to start_with("PRD-")
    expect(level(s[:chicken])).to eq(15_000)
    expect(level(s[:oil])).to eq(9_450)
    expect(level(s[:marinade])).to eq(5_000)
    expect(within(biz) { s[:marinade].reload.avg_cost_minor_per_base }).to eq(BigDecimal("54.4"))

    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Zinger Burger", yield_qty: 1,
                                  lines: [ { stock_item_id: s[:marinade].id, unit_id: s[:g].id, quantity: 150 }, { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:cost_minor]).to eq(8_160 + 2_500)
    expect(json[:food_cost][:percent]).to eq(23.7) # 10,660 of 45,000
    expect(json[:food_cost][:over_target]).to be false
    get "/api/v1/recipes/food_cost", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/recipes/coverage", headers: headers
    expect(json[:with_recipe]).to eq(1)
    expect(json[:missing].map { |p| p[:name] }).to eq([ "Chai" ])
  end

  def pay!(order)
    api_post "/api/v1/orders/#{order[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: order[:total_minor], tendered_minor: order[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:ok).or have_http_status(:created)
  end

  it "deducts stock when an order is completed (not when placed), snapshots recipe cost, deducts packaging, and returns stock on a refund" do
    s = seed_stock!
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Zinger Burger", lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:g].id, quantity: 150 }, { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: headers
    api_post "/api/v1/packaging_rules", { order_type: "takeaway", stock_item_id: s[:box].id, quantity: 1 }, headers: headers
    expect(response).to have_http_status(:created)
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:burger].id, quantity: 2 }, { product_id: m[:chai].id, quantity: 1 } ], place: true }, headers: headers
    expect(response).to have_http_status(:created)
    order_id = json[:id]
    placed = json
    expect(level(s[:chicken])).to eq(20_000) # SPEC: nothing moves at placing
    pay!(placed)
    expect(level(s[:chicken])).to eq(19_700)
    expect(level(s[:buns])).to eq(98)
    expect(level(s[:box])).to eq(99)
    get "/api/v1/orders/#{order_id}", headers: headers
    expect(json[:items].find { |i| i[:name] == "Zinger Burger" }[:recipe_cost_minor_snapshot]).to eq(2 * (7_500 + 2_500))
    get "/api/v1/stock/deduction_audits", headers: headers
    expect(json[:data].first[:status]).to eq("partial")
    expect(json[:data].first[:detail][:missing]).to eq([ "Chai" ])
    get "/api/v1/stock/consumption", headers: headers
    expect(json[:rows].map { |r| r[:item][:sku] }).to contain_exactly("CHK", "BUN", "BOX")
    expect(json[:total_value_minor]).to eq(15_000 + 5_000 + 1_500)

    api_post "/api/v1/orders/#{order_id}/refunds", { amount_minor: placed[:total_minor], method_code: "cash", reason: "Customer left" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(level(s[:chicken])).to eq(20_000)
    expect(level(s[:buns])).to eq(100)
    expect(level(s[:box])).to eq(100)
    get "/api/v1/stock/deduction_audits?status=reversed", headers: headers
    expect(json[:data].size).to eq(1)
  end

  it "records waste on a refund when returns are off, re-deducts an edit after completion, and skips when deduction is off" do
    s = seed_stock!
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Zinger Burger", lines: [ { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: headers
    api_post "/api/v1/orders", { order_type: "dine_in", lines: [ { product_id: m[:burger].id, quantity: 3 } ], place: true }, headers: headers
    o = json
    expect(level(s[:buns])).to eq(100)
    burger_line = o[:items].first
    api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger_line[:id], product_id: m[:burger].id, quantity: 3 }, { product_id: m[:burger].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(level(s[:buns])).to eq(100) # edits before completion move nothing
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: headers
    pay!(json.merge(id: o[:id]))
    expect(level(s[:buns])).to eq(96)
    api_patch "/api/v1/inventory_settings", { return_on_cancel: false }, headers: headers
    get "/api/v1/orders/#{o[:id]}", headers: headers
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: json[:total_minor], method_code: "cash", reason: "Wrong table" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(level(s[:buns])).to eq(96)
    get "/api/v1/stock/deduction_audits?status=waste", headers: headers
    expect(json[:data].size).to eq(1)

    api_patch "/api/v1/inventory_settings", { deduct_stock_on_sale: false }, headers: headers
    api_post "/api/v1/orders", { order_type: "dine_in", lines: [ { product_id: m[:burger].id, quantity: 1 } ], place: true }, headers: headers
    pay!(json)
    expect(level(s[:buns])).to eq(96)
    get "/api/v1/stock/deduction_audits?status=skipped", headers: headers
    expect(json[:data].size).to eq(1)
  end

  it "flags a probable wrong-unit recipe line and enforces one recipe per product" do
    s = seed_stock!
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Burger", lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:g].id, quantity: 150 } ] }, headers: headers
    api_post "/api/v1/recipes", { product_id: m[:chai].id, name: "Chai", lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/recipes/flags", headers: headers
    expect(json[:data].size).to eq(1)
    expect(json[:data].first[:recipe]).to eq("Chai")
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Burger again", lines: [ { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
  end
end

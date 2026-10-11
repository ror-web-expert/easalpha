require "rails_helper"

RSpec.describe "Stock", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  def seed_stock!
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      store = StockSection.ensure_system!(branch).last
      kg = Unit.find_by!(code: "kg")
      g = Unit.find_by!(code: "g")
      pcs = Unit.find_by!(code: "pcs")
      chicken = StockItem.create!(name: "Chicken", sku: "CHK", category: "Meat", base_unit: g, purchase_unit: kg, minimum_qty: 2000)
      buns = StockItem.create!(name: "Burger bun", sku: "BUN", category: "Bakery", base_unit: pcs, minimum_qty: 20)
      { kitchen: kitchen, store: store, kg: kg, g: g, pcs: pcs, chicken: chicken, buns: buns }
    end
  end

  it "seeds units, creates sections and items, and converts purchase units to base units" do
    get "/api/v1/units", headers: headers
    expect(json[:data].map { |u| u[:code] }).to include("g", "kg", "ml", "l", "pcs", "dz")
    api_post "/api/v1/units", { code: "box", name: "Box of 24", kind: "count", factor_to_base: 24 }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/stock_sections", headers: headers
    expect(json[:data].map { |s| s[:name] }).to eq([ "Kitchen", "Warehouse" ])
    kg = within(biz) { Unit.find_by!(code: "kg") }
    g = within(biz) { Unit.find_by!(code: "g") }
    api_post "/api/v1/stock_items", { name: "Flour", sku: "FLR", base_unit_id: g.id, purchase_unit_id: kg.id, minimum_qty: 5000 }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:base_unit][:code]).to eq("g")
    api_post "/api/v1/stock_items", { name: "Bad", base_unit_id: g.id, purchase_unit_id: within(biz) { Unit.find_by!(code: "pcs") }.id }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "receives stock with weighted average cost, transfers, wastes below zero, and refuses manual moves below zero" do
    s = seed_stock!
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:store].id, invoice_ref: "INV-1", post: true,
                                         lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 10, unit_cost_minor: 50_000 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:status]).to eq("posted")
    expect(json[:label]).to eq("GRN-000001")
    expect(json[:lines].first[:base_quantity]).to eq("10000.0")
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:store].id, post: true,
                                         lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 10, unit_cost_minor: 70_000 } ] }, headers: headers
    expect(json[:number]).to eq(2)
    get "/api/v1/stock_items/#{s[:chicken].id}", headers: headers
    expect(json[:quantity]).to eq("20000.0")
    expect(json[:avg_cost_minor_per_base].to_d).to eq(60.to_d) # Rs 600 per kg = 60 minor per gram
    expect(json[:value_minor]).to eq(1_200_000)

    api_post "/api/v1/stock_documents", { kind: "transfer", from_section_id: s[:store].id, to_section_id: s[:kitchen].id, post: true,
                                         lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/stock/levels", headers: headers
    row = json[:rows].find { |r| r[:item][:sku] == "CHK" }
    expect(row[:sections].map { |x| x[:quantity] }).to contain_exactly("15000.0", "5000.0")
    expect(json[:total_value_minor]).to eq(1_200_000)

    api_post "/api/v1/stock_documents", { kind: "waste", from_section_id: s[:kitchen].id, reason: "Spoiled", post: true,
                                         lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(within(biz) { Notification.find_by(kind: "negative_stock") }).to be_present

    api_post "/api/v1/stock_documents", { kind: "transfer", from_section_id: s[:kitchen].id, to_section_id: s[:store].id, post: true,
                                         lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("stock.below_zero")
    api_patch "/api/v1/inventory_settings", { allow_manual_below_zero: true }, headers: headers
    api_post "/api/v1/stock_documents", { kind: "transfer", from_section_id: s[:kitchen].id, to_section_id: s[:store].id, post: true,
                                         lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:created)

    get "/api/v1/stock/waste?group_by=reason", headers: headers
    expect(json[:rows].first[:key]).to eq("Spoiled")
    get "/api/v1/stock/levels?low=true", headers: headers
    expect(json[:rows].map { |r| r[:item][:sku] }).to eq([ "BUN" ])
  end

  it "counts only while the counting switch is open, posts the difference, and the daily sheet balances" do
    s = seed_stock!
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:kitchen].id, post: true, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 100, unit_cost_minor: 2_500 } ] }, headers: headers
    api_post "/api/v1/stock_documents", { kind: "count", from_section_id: s[:kitchen].id, post: true, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, counted_qty: 92 } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("stock.counting_closed")
    api_post "/api/v1/inventory_settings/counting", { open: true }, headers: headers
    expect(json[:counting_open]).to be true
    api_post "/api/v1/stock_documents", { kind: "count", from_section_id: s[:kitchen].id, post: true, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, counted_qty: 92 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:lines].first[:expected_qty]).to eq("100.0")
    get "/api/v1/stock/daily_sheet?section_id=#{s[:kitchen].id}", headers: headers
    row = json[:rows].first
    expect(row[:opening]).to eq("0.0")
    expect(row[:in]).to eq("100.0")
    expect(row[:adjusted]).to eq("-8.0")
    expect(row[:closing]).to eq("92.0")
    expect(row[:closing_value_minor]).to eq(230_000)
    get "/api/v1/stock/ledger?kind=count", headers: headers
    expect(json[:data].size).to eq(1)
    expect(json[:data].first[:quantity]).to eq("-8.0")
  end

  it "cancels a posted document with reversing rows, keeps the ledger insert-only, and honours the day lock" do
    s = seed_stock!
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:kitchen].id, post: true, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 40, unit_cost_minor: 2_000 } ] }, headers: headers
    doc_id = json[:id]
    api_post "/api/v1/stock_documents/#{doc_id}/cancel", { reason: "Wrong supplier" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("voided")
    get "/api/v1/stock_items/#{s[:buns].id}", headers: headers
    expect(json[:quantity]).to eq("0.0")
    get "/api/v1/stock_items/#{s[:buns].id}/ledger", headers: headers
    expect(json[:data].size).to eq(2)
    expect(json[:data].map { |e| e[:quantity] }).to contain_exactly("40.0", "-40.0")
    original = json[:data].find { |e| e[:quantity] == "40.0" }
    expect(original[:reversed_by_entry_id]).to be_present
    within(biz) do
      conn = StockLedgerEntry.connection
      expect { conn.transaction(requires_new: true) { conn.execute("UPDATE stock_ledger_entries SET quantity = 1 WHERE id = #{conn.quote(original[:id])}") } }.to raise_error(ActiveRecord::StatementInvalid, /insert-only/)
      expect { conn.transaction(requires_new: true) { conn.execute("DELETE FROM stock_ledger_entries WHERE id = #{conn.quote(original[:id])}") } }.to raise_error(ActiveRecord::StatementInvalid, /insert-only/)
    end
    api_patch "/api/v1/inventory_settings", { day_lock_date: today_for(biz).to_s }, headers: headers
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:kitchen].id, post: true, lines: [ { stock_item_id: s[:buns].id, unit_id: s[:pcs].id, quantity: 1 } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("stock.day_locked")
  end

  it "imports items with opening quantities from CSV and is idempotent on client_id" do
    within(biz) { Unit.seed_defaults! }
    csv = "Item Name,Code,Category,Unit,Min,Opening,Cost\nTomato,TOM,Veg,kg,2,15,120\nOil,OIL,Grocery,l,5,20,450\nBroken,,,,xx,,\n"
    api_post "/api/v1/stock_items/import/preview", { csv: csv }, headers: headers
    expect(json[:row_count]).to eq(3)
    expect(json[:valid_count]).to eq(2)
    api_post "/api/v1/stock_items/import", { csv: csv }, headers: headers
    expect(json[:created]).to eq(2)
    expect(json[:opening_documents]).to eq([ "ADJ-000001" ])
    get "/api/v1/stock/levels", headers: headers
    tom = json[:rows].find { |r| r[:item][:sku] == "TOM" }
    expect(tom[:quantity]).to eq("15.0")
    expect(tom[:item][:avg_cost_minor_per_base].to_d).to eq(12_000)
    kitchen = within(biz) { StockSection.default_for(branch) }
    item = within(biz) { StockItem.find_by!(sku: "TOM") }
    2.times { api_post "/api/v1/stock_documents", { kind: "waste", from_section_id: kitchen.id, reason: "Burnt", client_id: "11111111-1111-1111-1111-111111111111", post: true, lines: [ { stock_item_id: item.id, quantity: 1 } ] }, headers: headers }
    expect(within(biz) { StockDocument.where(kind: "waste").count }).to eq(1)
  end

  it "lets kitchen staff record waste but not receive stock, and isolates businesses" do
    s = seed_stock!
    kitchen_staff = add_member!(biz, "kitchen")
    api_post "/api/v1/stock_documents", { kind: "waste", from_section_id: s[:kitchen].id, reason: "Dropped", post: true, lines: [ { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: auth_headers(kitchen_staff, app: "kitchen")
    expect(response).to have_http_status(:created)
    api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: s[:kitchen].id, lines: [ { stock_item_id: s[:buns].id, quantity: 1 } ] }, headers: auth_headers(kitchen_staff, app: "kitchen")
    expect(response).to have_http_status(:forbidden)
    other = signup_business(name: "Other")
    get "/api/v1/stock_items/#{s[:buns].id}", headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
    get "/api/v1/stock_items", headers: auth_headers(other)
    expect(json[:data]).to eq([])
  end
end

require "rails_helper"

# SPEC "Inventory and recipes": system sections with COGS Primary and slugs, auto SKUs and the active flag, conversions
# stored in each direction, the eight document types and five statuses numbered like GRN-000023 with a posting date,
# Demand buckets with on-order and transfer-vs-buy, Reset Stock, Actual vs Theoretical, Valuation & COGS, low-stock alerts.
RSpec.describe "Inventory register", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:cashier) { add_member!(biz, "cashier") }

  def seed_units!
    within(biz) { Unit.seed_defaults!; { pcs: Unit.find_by!(code: "pcs"), g: Unit.find_by!(code: "g"), kg: Unit.find_by!(code: "kg") } }
  end

  describe "sections" do
    it "seeds Kitchen and Warehouse as system sections, Warehouse as COGS Primary, with slugs, and refuses to remove them" do
      get "/api/v1/stock_sections", headers: headers
      names = json[:data].map { |s| [s[:name], s[:slug], s[:is_system], s[:cogs_primary]] }
      expect(names).to include(["Kitchen", "kitchen", true, false], ["Warehouse", "warehouse", true, true])
      wh = json[:data].find { |s| s[:slug] == "warehouse" }
      delete "/api/v1/stock_sections/#{wh[:id]}", headers: headers
      expect(response).to have_http_status(:conflict)
      api_post "/api/v1/stock_sections", { name: "BBQ Station" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:slug]).to eq("bbq-station")
    end
  end

  describe "items and units" do
    it "generates a SKU from the name and category, keeps an active flag, and stores conversions both ways" do
      u = seed_units!
      api_post "/api/v1/stock_items", { name: "Adrak Ginger", purchase_category: "General Local Purchase", base_unit_id: u[:g].id }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:sku]).to match(/\AAG-GE-\d{4}\z/)
      expect(json[:active]).to be true
      expect(json[:purchase_category]).to eq("General Local Purchase")
      api_patch "/api/v1/stock_items/#{json[:id]}", { active: false }, headers: headers
      expect(json[:active]).to be false
      api_post "/api/v1/units", { code: "pet12", name: "Pet12", kind: "count", factor_to_base: 12 }, headers: headers
      pet = json
      api_post "/api/v1/units", { code: "btl", name: "Bottle", kind: "count", factor_to_base: 1 }, headers: headers
      btl = json
      api_post "/api/v1/unit_conversions", { from_unit_id: pet[:id], to_unit_id: btl[:id], factor: 12 }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:data].map { |c| [c[:from_code], c[:to_code], c[:factor].to_f] }).to contain_exactly(["pet12", "btl", 12.0], ["btl", "pet12", (1.0 / 12).round(9)])
      get "/api/v1/unit_conversions", headers: headers
      expect(json[:data].map { |c| [c[:from_code], c[:to_code]] }).to include(["kg", "g"], ["g", "kg"], ["pet12", "btl"])
      within(biz) { expect(Unit.find(pet[:id]).convert(2, to: Unit.find(btl[:id]))).to eq(24) }
    end
  end

  describe "document register" do
    it "numbers per type like GRN-000001, accepts a posting date, supports approval and transit, and voids" do
      u = seed_units!
      item = within(biz) { StockItem.create!(name: "Box", base_unit: u[:pcs]) }
      sections = within(biz) { StockSection.ensure_system!(branch) }
      kitchen, warehouse = sections
      api_post "/api/v1/stock_documents", { kind: "opening_balance", to_section_id: warehouse.id, posting_date: Date.current - 1, lines: [{ stock_item_id: item.id, quantity: 50, unit_cost_minor: 1_000 }], post: true }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:label]).to eq("OPB-000001")
      expect(json[:status]).to eq("posted")
      expect(json[:posting_date]).to eq((Date.current - 1).iso8601)
      api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: warehouse.id, lines: [{ stock_item_id: item.id, quantity: 10, unit_cost_minor: 1_000 }], post: true }, headers: headers
      expect(json[:label]).to eq("GRN-000001")
      api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: warehouse.id, posting_date: Date.current + 1, lines: [{ stock_item_id: item.id, quantity: 1 }], post: true }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("stock.future_date")

      # A transfer drafted and submitted by a cashier waits for approval, then goes in transit, then is received.
      within(biz) { cashier.set_permissions!(%w[SALES_WALKIN PURCHASE_ORDERS]) }
      ch = auth_headers(cashier.reload)
      api_post "/api/v1/stock_documents", { kind: "transfer", from_section_id: warehouse.id, to_section_id: kitchen.id, lines: [{ stock_item_id: item.id, quantity: 20 }], submit: true }, headers: ch
      expect(response).to have_http_status(:created)
      expect(json[:status]).to eq("awaiting_approval")
      doc_id = json[:id]
      api_post "/api/v1/stock_documents/#{doc_id}/approve", {}, headers: ch
      expect(response).to have_http_status(:forbidden)
      api_post "/api/v1/stock_documents/#{doc_id}/approve", {}, headers: headers
      expect(json[:status]).to eq("in_transit")
      within(biz) do
        expect(StockLevel.find_by(stock_section_id: warehouse.id, stock_item_id: item.id).quantity).to eq(40)
        expect(StockLevel.find_by(stock_section_id: kitchen.id, stock_item_id: item.id)&.quantity.to_d).to eq(0)
      end
      api_post "/api/v1/stock_documents/#{doc_id}/receive", {}, headers: headers
      expect(json[:status]).to eq("posted")
      within(biz) { expect(StockLevel.find_by(stock_section_id: kitchen.id, stock_item_id: item.id).quantity).to eq(20) }
      api_post "/api/v1/stock_documents/#{doc_id}/cancel", { reason: "wrong" }, headers: headers
      expect(json[:status]).to eq("voided")
      within(biz) { expect(StockLevel.find_by(stock_section_id: kitchen.id, stock_item_id: item.id).quantity).to eq(0) }
      get "/api/v1/stock_documents?status=voided", headers: headers
      expect(json[:data].size).to eq(1)
    end
  end

  describe "demand, reset and reports" do
    it "buckets items, subtracts what is on order, splits transfer and buy, resets stock, and reports actual vs theoretical and COGS" do
      u = seed_units!
      kitchen, warehouse = within(biz) { StockSection.ensure_system!(branch) }
      low = within(biz) { StockItem.create!(name: "Lemons", base_unit: u[:pcs], minimum_qty: 20) }
      out = within(biz) { StockItem.create!(name: "Mint", base_unit: u[:pcs], minimum_qty: 5) }
      api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: warehouse.id, lines: [{ stock_item_id: low.id, quantity: 30, unit_cost_minor: 500 }], post: true }, headers: headers
      api_post "/api/v1/stock_documents", { kind: "receive", to_section_id: kitchen.id, lines: [{ stock_item_id: low.id, quantity: 5, unit_cost_minor: 500 }], post: true }, headers: headers
      get "/api/v1/stock/demand?section_id=#{kitchen.id}", headers: headers
      expect(response).to have_http_status(:ok)
      rows = json[:rows].index_by { |r| r[:item][:name] }
      expect(rows["Lemons"][:bucket]).to eq("critical")
      expect(rows["Lemons"][:transfer_qty].to_f).to be > 0
      expect(rows["Mint"][:bucket]).to eq("out")
      expect(json[:counts]).to include(critical: 1, out: 1)
      get "/api/v1/stock/demand?bucket=out", headers: headers
      expect(json[:rows].map { |r| r[:item][:name] }).to eq(["Mint"])

      api_patch "/api/v1/settings", { values: { "inventory.stock_alerts.low_stock" => true } }, headers: headers
      api_post "/api/v1/stock_documents", { kind: "waste", from_section_id: warehouse.id, reason: "rotten", lines: [{ stock_item_id: low.id, quantity: 15 }], post: true }, headers: headers
      within(biz) { expect(Notification.where(kind: "low_stock").count).to eq(1) }

      api_post "/api/v1/stock_documents", { kind: "count", from_section_id: warehouse.id, lines: [{ stock_item_id: low.id, counted_qty: 12 }], post: true }, headers: headers
      expect(response).to have_http_status(:conflict) # counting is closed
      api_post "/api/v1/inventory_settings/counting", { open: true }, headers: headers
      api_post "/api/v1/stock_documents", { kind: "count", from_section_id: warehouse.id, lines: [{ stock_item_id: low.id, counted_qty: 12 }], post: true }, headers: headers
      expect(response).to have_http_status(:created)
      get "/api/v1/stock/actual_vs_theoretical?section_id=#{warehouse.id}", headers: headers
      row = json[:rows].find { |r| r[:item][:name] == "Lemons" }
      expect(row).to include(actual: "12.0", theoretical: "15.0", variance: "-3.0")
      get "/api/v1/stock/valuation_cogs", headers: headers
      expect(json[:stock_value_minor]).to be > 0
      expect(json[:cogs_minor]).to eq(0)

      api_post "/api/v1/stock/reset", { section_id: warehouse.id }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
      within(biz) { owner.set_pin!("9999") }
      api_post "/api/v1/stock/reset", { section_id: warehouse.id, approver_pin: "9999" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:documents].first[:kind]).to eq("adjustment")
      within(biz) { expect(StockLevel.where(stock_section_id: warehouse.id).sum(:quantity)).to eq(0) }
    end
  end
end

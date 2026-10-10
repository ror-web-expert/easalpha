require "rails_helper"

# SPEC "Menu and catalog": product discount and PCT code, category subtitle, deal favourite, image upload,
# Order Inventory consumables per order type and variant, Quick Add Menu, hidden menus off the customer site, product codes.
RSpec.describe "Catalog SPEC fields", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:cashier) { add_member!(biz, "cashier") }

  def seed_stock!
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      pcs = Unit.find_by!(code: "pcs")
      box = StockItem.create!(name: "Box", sku: "BOX", base_unit: pcs, is_packaging: true)
      bag = StockItem.create!(name: "Bag", sku: "BAG", base_unit: pcs, is_packaging: true)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [
        { stock_item_id: box.id, quantity: 100, unit_cost_minor: 1_500 }, { stock_item_id: bag.id, quantity: 100, unit_cost_minor: 500 }
      ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      { pcs: pcs, box: box, bag: bag }
    end
  end
  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity) }

  describe "product fields" do
    it "saves a % or Rs discount and a PCT code, and the discount comes off the line at pricing" do
      api_patch "/api/v1/products/#{m[:chai].id}", { discount_value: 10, discount_type: "percent", pct_code: "98.21.00" }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json).to include(discount_value: "10.0", discount_type: "percent", pct_code: "98.21.00")
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id, quantity: 2 }] }, headers: headers
      expect(json[:items].first[:line_discount_minor]).to eq(1_600) # 10% of 2 × Rs 80
      api_patch "/api/v1/products/#{m[:chai].id}", { discount_value: 5, discount_type: "amount" }, headers: headers
      api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:chai].id, quantity: 2 }] }, headers: headers
      expect(json[:items].first[:line_discount_minor]).to eq(1_000) # Rs 5 × 2
      api_patch "/api/v1/products/#{m[:chai].id}", { discount_value: 120, discount_type: "percent" }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "saves a category subtitle and a deal favourite" do
      cat_id = within(biz) { m[:burger].category_id }
      api_patch "/api/v1/categories/#{cat_id}", { subtitle: "Charcoal grilled" }, headers: headers
      expect(json[:subtitle]).to eq("Charcoal grilled")
      api_patch "/api/v1/deals/#{m[:deal].id}", { is_favourite: true }, headers: headers
      expect(json[:is_favourite]).to be true
      get "/api/v1/catalog", headers: headers
      expect(json[:deals].first[:is_favourite]).to be true
    end
  end

  describe "image upload" do
    it "accepts a PNG under 5 MB, serves it publicly, and refuses other types" do
      png = Rack::Test::UploadedFile.new(StringIO.new("\x89PNG\r\n\x1a\n" + "0" * 100), "image/png", original_filename: "burger.png")
      post "/api/v1/uploads", params: { file: png }, headers: { "Authorization" => headers["Authorization"] }
      expect(response).to have_http_status(:created)
      key = json[:key]
      expect(key).to include("/api/v1/uploads/")
      get URI(key).path
      expect(response).to have_http_status(:ok)
      expect(response.content_type).to start_with("image/png")
      txt = Rack::Test::UploadedFile.new(StringIO.new("hello"), "text/plain", original_filename: "x.txt")
      post "/api/v1/uploads", params: { file: txt }, headers: { "Authorization" => headers["Authorization"] }
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("upload.type")
      post "/api/v1/uploads", params: { file: png }, headers: { "Authorization" => auth_headers(cashier)["Authorization"] }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "order inventory consumables" do
    it "sets consumables per order type and variant, copies to all order types, and deducts them with the sale" do
      s = seed_stock!
      api_put "/api/v1/products/#{m[:burger].id}/consumables", { rows: [{ order_type: "takeaway", stock_item_id: s[:box].id, quantity: 1, unit_id: s[:pcs].id },
                                                                       { order_type: "takeaway", variant_id: m[:double].id, stock_item_id: s[:bag].id, quantity: 2, unit_id: s[:pcs].id }] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:data].size).to eq(2)
      api_post "/api/v1/orders", { order_type: "takeaway", lines: [{ product_id: m[:burger].id, variant_id: m[:double].id, quantity: 1 }, { product_id: m[:burger].id, quantity: 3 }], place: true }, headers: headers
      expect(response).to have_http_status(:created)
      expect(level(s[:bag])).to eq(98)  # the Double variant's own rows apply to it
      expect(level(s[:box])).to eq(97)  # product-level rows apply to the plain lines
      api_put "/api/v1/products/#{m[:burger].id}/consumables", { rows: [{ order_type: "delivery", stock_item_id: s[:box].id, quantity: 1, unit_id: s[:pcs].id }], copy_all_order_types: true }, headers: headers
      expect(json[:data].map { |c| c[:order_type] }).to match_array(Product::ORDER_TYPES)
    end

    it "needs menu.edit" do
      api_put "/api/v1/products/#{m[:burger].id}/consumables", { rows: [] }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "quick add menu" do
    it "stores an ordered list and sends it to the till in the catalog and the sync" do
      api_put "/api/v1/quick_add_items", { items: [{ product_id: m[:chai].id }, { product_id: m[:burger].id, variant_id: m[:double].id }] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:data].map { |q| q[:name] }).to eq(["Chai", "Zinger Burger"])
      expect(json[:data].last).to include(variant_name: "Double", price_minor: 65_000)
      get "/api/v1/catalog", headers: auth_headers(cashier, app: "pos")
      expect(json[:quick_add_items].size).to eq(2)
      get "/api/v1/sync/changes", headers: auth_headers(cashier, app: "pos")
      expect(json[:quick_add_items].size).to eq(2)
      api_put "/api/v1/quick_add_items", { items: [] }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "online visibility" do
    it "keeps a hidden menu's products off the QR menu while the till still sells them" do
      m
      table = within(biz) { branch.update!(qr_settings: { "enabled" => true }); DiningTable.create!(branch: branch, code: "T1", name: "T1", seats: 2) }
      get "/api/v1/qr/#{table.qr_token}"
      expect(json[:products].map { |p| p[:name] }).to include("Chai")
      api_patch "/api/v1/menus/#{m[:menu].id}", { show_online: false }, headers: headers
      get "/api/v1/qr/#{table.qr_token}"
      expect(json[:products]).to be_empty
      get "/api/v1/catalog", headers: auth_headers(cashier, app: "pos")
      expect(json[:products].map { |p| p[:name] }).to include("Chai")
    end
  end

  describe "product codes" do
    it "lists and bulk-updates SKU and PCT codes" do
      m
      get "/api/v1/products/codes", headers: headers
      row = json[:data].find { |r| r[:name] == "Chai" }
      api_put "/api/v1/products/codes", { rows: [{ id: row[:id], sku: "CHAI-01", pct_code: "98.21.00" }] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:data].find { |r| r[:id] == row[:id] }).to include(sku: "CHAI-01", pct_code: "98.21.00")
    end
  end
end

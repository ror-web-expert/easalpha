require "rails_helper"

RSpec.describe "Menu", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }
  let(:biz) { owner.business }

  def create_menu(name: "Main")
    api_post "/api/v1/menus", { name: name, is_default: true }, headers: headers
    json[:id]
  end

  def create_category(menu_id, name: "Burgers")
    api_post "/api/v1/categories", { menu_id: menu_id, name: name }, headers: headers
    json[:id]
  end

  it "builds a menu with categories, a product with variants, order-type prices and modifiers" do
    menu_id = create_menu
    cat_id = create_category(menu_id)
    api_post "/api/v1/modifier_groups", { name: "Spice", min_select: 1, max_select: 1, required: true, modifiers: [ { name: "Mild", price_minor: 0 }, { name: "Extra hot", price_minor: 2000 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    group_id = json[:id]
    expect(json[:modifiers].size).to eq(2)

    api_post "/api/v1/products", {
      category_id: cat_id, name: "Zinger Burger", sku: "ZB-1", base_price_minor: 45_000, allergens: [ "gluten" ],
      variants: [ { name: "Single", price_minor: 45_000 }, { name: "Double", price_minor: 65_000 } ],
      prices: [ { order_type: "delivery", price_minor: 50_000 } ],
      modifier_group_ids: [ group_id ]
    }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:variants].size).to eq(2)
    expect(json[:prices].first[:order_type]).to eq("delivery")
    expect(json[:modifier_group_ids]).to eq([ group_id ])

    within(biz) do
      p = Product.includes(:product_prices, :variants).find(json[:id])
      expect(p.price_for(order_type: "dine_in")).to eq(45_000)
      expect(p.price_for(order_type: "delivery")).to eq(50_000)
      expect(p.price_for(order_type: "delivery", variant: p.variants.last)).to eq(65_000)
    end

    get "/api/v1/products?q=zing", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/categories?menu_id=#{menu_id}", headers: headers
    expect(json[:data].first[:product_count]).to eq(1)
  end

  it "rejects a duplicate SKU, logs price changes, and archives instead of deleting" do
    cat_id = create_category(create_menu)
    api_post "/api/v1/products", { category_id: cat_id, name: "A", sku: "X1", base_price_minor: 100 }, headers: headers
    pid = json[:id]
    api_post "/api/v1/products", { category_id: cat_id, name: "B", sku: "X1", base_price_minor: 100 }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    api_patch "/api/v1/products/#{pid}", { base_price_minor: 150 }, headers: headers
    expect(response).to have_http_status(:ok)
    get "/api/v1/audit_logs?action_name=price_change", headers: headers
    expect(json[:data].size).to eq(1)
    delete "/api/v1/products/#{pid}", headers: headers
    expect(response).to have_http_status(:no_content)
    within(biz) { expect(Product.unscoped.find(pid).archived_at).to be_present }
    get "/api/v1/products", headers: headers
    expect(json[:data]).to be_empty
  end

  it "keeps a menu hidden online and the last menu undeletable" do
    menu_id = create_menu
    api_patch "/api/v1/menus/#{menu_id}", { show_online: false, time_rules: { days: [ 1, 2, 3, 4, 5 ], start: "06:00", end: "11:00" } }, headers: headers
    expect(json[:show_online]).to be false
    delete "/api/v1/menus/#{menu_id}", headers: headers
    expect(response).to have_http_status(:conflict)
    within(biz) do
      m = Menu.find(menu_id)
      expect(m.available_at?(Time.find_zone("Asia/Karachi").parse("2026-10-07 08:00"))).to be true
      expect(m.available_at?(Time.find_zone("Asia/Karachi").parse("2026-10-07 13:00"))).to be false
      expect(m.available_at?(Time.find_zone("Asia/Karachi").parse("2026-10-11 08:00"))).to be false
    end
  end

  it "creates a deal with items and a promotion with a unit limit and coupon" do
    cat_id = create_category(create_menu)
    api_post "/api/v1/products", { category_id: cat_id, name: "Biryani", base_price_minor: 30_000 }, headers: headers
    biryani = json[:id]
    api_post "/api/v1/deals", { name: "Lunch Box", price_minor: 50_000, items: [ { product_id: biryani, quantity: 1 }, { product_id: biryani, quantity: 2, choice_group: "drink" } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:items].size).to eq(2)
    api_post "/api/v1/deals", { name: "Empty", price_minor: 1, items: [] }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)

    api_post "/api/v1/promotions", { name: "Eid", kind: "coupon", value: 10, coupon_code: "eid10", unit_limit: 1, min_order_minor: 1000 }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:coupon_code]).to eq("EID10")
    get "/api/v1/promotions/check?coupon_code=eid10&amount_minor=20000", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:discount_minor]).to eq(2000)
    within(biz) { Promotion.find_by!(coupon_code: "EID10").update!(units_sold: 1) }
    get "/api/v1/promotions/check?coupon_code=eid10&amount_minor=20000", headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("coupon.unavailable")
    get "/api/v1/promotions/check?coupon_code=nope", headers: headers
    expect(response).to have_http_status(:not_found)
  end

  it "computes inclusive and exclusive tax" do
    api_post "/api/v1/tax_rates", { name: "PRA 16%", rate: 16, inclusive: false, authority: "pra", is_default: true }, headers: headers
    expect(response).to have_http_status(:created)
    within(biz) do
      t = TaxRate.first
      expect(t.tax_on(10_000)).to eq(1_600)
      t.update!(inclusive: true)
      expect(t.tax_on(11_600)).to eq(1_600)
    end
  end

  it "previews and applies a CSV import, then exports the menu" do
    csv = "category,name,price,sku,name_ur\nStarters,Fries,230,FR-1,فرائز\nStarters,Garlic Fries,260,FR-2,\nBurgers,Zinger,,ZB-1,\n,Orphan,100,,\n"
    api_post "/api/v1/menu/import/preview", { source: "csv", data: csv }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:row_count]).to eq(4)
    expect(json[:valid_count]).to eq(2)
    expect(json[:error_rows].map { |r| r[:error] }).to include("price is not a number", "category is missing")
    job_id = json[:import_job_id]
    api_post "/api/v1/menu/import/apply", { import_job_id: job_id }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:created]).to eq(2)
    expect(json[:skipped]).to eq(2)
    api_post "/api/v1/menu/import/apply", { import_job_id: job_id }, headers: headers
    expect(response).to have_http_status(:conflict)

    get "/api/v1/menu/export", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:menus].first[:categories].first[:products].map { |p| p[:name] }).to include("Fries", "Garlic Fries")
    expect(json[:menus].first[:categories].first[:products].find { |p| p[:name] == "Fries" }[:base_price_minor]).to eq(23_000)
  end

  it "imports the ArfaPOS JSON shape and updates existing products by SKU" do
    doc = { menus: [ { name: "Default", categories: [ { name: "Pizza", products: [ { name: "Sky Special", selling_price: "1,200", code: "PZ-1" } ] } ] } ] }
    api_post "/api/v1/menu/import/preview", { source: "arfapos_json", data: doc }, headers: headers
    expect(json[:valid_count]).to eq(1)
    api_post "/api/v1/menu/import/apply", { import_job_id: json[:import_job_id] }, headers: headers
    expect(json[:created]).to eq(1)
    doc2 = { menus: [ { name: "Default", categories: [ { name: "Pizza", products: [ { name: "Sky Special", selling_price: "1,300", code: "PZ-1" } ] } ] } ] }
    api_post "/api/v1/menu/import/preview", { source: "arfapos_json", data: doc2 }, headers: headers
    api_post "/api/v1/menu/import/apply", { import_job_id: json[:import_job_id] }, headers: headers
    expect(json[:updated]).to eq(1)
    within(biz) { expect(Product.find_by!(sku: "PZ-1").base_price_minor).to eq(130_000) }
  end

  it "serves the catalog to a paired device and to staff, with incremental sync" do
    cat_id = create_category(create_menu)
    api_post "/api/v1/products", { category_id: cat_id, name: "Chai", base_price_minor: 8_000 }, headers: headers
    device = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
    get "/api/v1/catalog", headers: device_headers(device)
    expect(response).to have_http_status(:ok)
    expect(json[:products].size).to eq(1)
    expect(json[:menus].first[:available_now]).to be true
    expect(json[:branch][:id]).to eq(device.branch_id)
    get "/api/v1/catalog?since=#{1.minute.from_now.utc.iso8601}", headers: headers
    expect(json[:products]).to be_empty
    get "/api/v1/catalog"
    expect(response).to have_http_status(:unauthorized)
  end

  it "requires menu.edit to change the menu" do
    cashier = within(biz) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active") }
    api_post "/api/v1/menus", { name: "X" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/menus", headers: auth_headers(cashier)
    expect(response).to have_http_status(:ok)
  end

  describe "isolation" do
    include_examples "tenant isolated", -> { "/api/v1/menus/#{create_menu}" }
    include_examples "tenant isolated", -> { cat = create_category(create_menu); api_post("/api/v1/products", { category_id: cat, name: "P", base_price_minor: 1 }, headers: headers); "/api/v1/products/#{json[:id]}" }
    include_examples "tenant isolated", -> { api_post("/api/v1/promotions", { name: "P", kind: "percent", value: 5 }, headers: headers); "/api/v1/promotions/#{json[:id]}" }
  end
end

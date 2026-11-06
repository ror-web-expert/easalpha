require "rails_helper"

# A new owner setting up a business (browser QA of 6 Nov 2026, section S).
RSpec.describe "A new owner setting up a business", type: :request do
  def sign_up(**extra)
    api_post "/api/v1/auth/signup", { name: "Sana", business_name: "QA Setup #{SecureRandom.hex(3)}", email: "sana-#{SecureRandom.hex(4)}@example.com",
                                      password: "password123", phone: "+92300#{rand(1_000_000..9_999_999)}" }.merge(extra)
    expect(response).to have_http_status(:created), response.body
    json
  end

  def headers_for(session) = { "Authorization" => "Bearer #{session[:access_token]}", "Content-Type" => "application/json" }

  describe "S3: country, currency and time zone at sign-up" do
    it "keeps a Pakistani sign-up in Pakistan when the browser said nothing, and follows the phone and the zone" do
      s = sign_up
      expect(s[:business]).to include(country: "PK", currency: "PKR", time_zone: "Asia/Karachi")
      expect(s[:branch][:time_zone]).to eq("Asia/Karachi")
      expect(sign_up(phone: "+97150#{rand(1_000_000..9_999_999)}")[:business]).to include(country: "AE", currency: "AED", time_zone: "Asia/Dubai")
      expect(sign_up(phone: "+1202#{rand(1_000_000..9_999_999)}", time_zone: "America/Toronto")[:business]).to include(country: "CA", currency: "CAD", time_zone: "America/Toronto")
      expect(sign_up(country: "GB", currency: "GBP", time_zone: "Europe/London")[:business]).to include(country: "GB", currency: "GBP", time_zone: "Europe/London")
    end

    it "moves the branches that followed the store's time zone when the owner changes it, and leaves one set apart" do
      s = sign_up(country: "US", currency: "USD", time_zone: "America/New_York")
      h = headers_for(s)
      api_post "/api/v1/branches", { name: "Dubai", code: "DXB", time_zone: "Asia/Dubai" }, headers: h
      expect(response).to have_http_status(:created), response.body # the trial plan (Business) allows 20 branches
      api_post "/api/v1/branches", { name: "Queens", code: "NYC2" }, headers: h # no zone given: the store's, not Karachi
      expect(json[:time_zone]).to eq("America/New_York")
      api_patch "/api/v1/business", { country: "PK", currency: "PKR", time_zone: "Asia/Karachi" }, headers: h
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(country: "PK", currency: "PKR", time_zone: "Asia/Karachi")
      get "/api/v1/branches", headers: h
      zones = json[:data].to_h { |b| [ b[:code], b[:time_zone] ] }
      expect(zones).to eq("B1" => "Asia/Karachi", "NYC2" => "Asia/Karachi", "DXB" => "Asia/Dubai")
    end
  end

  describe "S2: products without a discount" do
    let!(:owner) { signup_business }
    let(:headers) { auth_headers(owner) }
    let!(:m) { build_menu!(owner.business) }

    it "saves a product whose discount is null, and removes a discount the same way" do
      api_post "/api/v1/products", { category_id: m[:burger].category_id, name: "Plain Fries", base_price_minor: 20_000, discount_value: nil, discount_type: nil }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json).to include(discount_value: "0.0", discount_type: "percent")
      id = json[:id]
      api_patch "/api/v1/products/#{id}", { discount_value: "10", discount_type: "amount" }, headers: headers
      expect(json).to include(discount_value: "10.0", discount_type: "amount")
      api_patch "/api/v1/products/#{id}", { name: "Plain Fries", discount_value: nil, discount_type: nil }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discount_value]).to eq("0.0")
      within(owner.business) { expect(Product.find(id).discount_minor_for(20_000, 1)).to eq(0) }
      api_patch "/api/v1/products/#{id}", { discount_value: "120", discount_type: "percent" }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "S7: building the menu from nothing" do
    it "files the first category in a default menu made on first use, and loads the sample menu into it" do
      s = sign_up
      h = headers_for(s)
      get "/api/v1/menus", headers: h
      expect(json[:data]).to be_empty
      api_post "/api/v1/categories", { name: "Drinks" }, headers: h
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/menus", headers: h
      expect(json[:data].map { |x| [ x[:name], x[:is_default] ] }).to eq([ [ "Main menu", true ] ])
      api_post "/api/v1/categories", { name: "Snacks" }, headers: h
      get "/api/v1/menus", headers: h
      expect(json[:data].size).to eq(1)
      api_post "/api/v1/onboarding/sample_menu", {}, headers: h
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/menus", headers: h
      expect(json[:data].map { |x| x[:name] }).to eq([ "Main menu" ])
      get "/api/v1/setup_checklist", headers: h
      expect(json[:data].find { |i| i[:key] == "menu" }[:done]).to be true
    end
  end

  describe "S8: archived products" do
    let!(:owner) { signup_business }
    let(:headers) { auth_headers(owner) }
    let!(:m) { build_menu!(owner.business) }

    before do
      api_put "/api/v1/products/#{m[:chai].id}", { barcodes: [ { code: "CHAI-1" } ] }, headers: headers
      delete "/api/v1/products/#{m[:chai].id}", headers: headers
    end

    it "lists them on their own and restores one with its barcodes" do
      get "/api/v1/products", params: { include_inactive: "true" }, headers: headers
      expect(json[:data].map { |p| p[:id] }).not_to include(m[:chai].id)
      get "/api/v1/products", params: { archived: "true" }, headers: headers
      expect(json[:data].map { |p| p[:id] }).to eq([ m[:chai].id ])
      expect(json[:data].first[:barcodes].map { |b| b[:code] }).to eq([ "CHAI-1" ])
      get "/api/v1/products/barcode_lookup", params: { code: "CHAI-1" }, headers: headers
      expect(response).to have_http_status(:not_found) # an archived product never sells by its code

      api_post "/api/v1/products/#{m[:chai].id}/restore", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(archived_at: nil, active: true)
      get "/api/v1/products/barcode_lookup", params: { code: "CHAI-1" }, headers: headers
      expect(json[:product_id]).to eq(m[:chai].id)
    end

    it "restores one opened by its address when Active is ticked, instead of saying Saved and leaving it archived" do
      api_patch "/api/v1/products/#{m[:chai].id}", { name: "Chai", active: true }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(archived_at: nil, active: true)
    end

    it "gives its code to a product that claims it, through the form or the till's attach" do
      api_post "/api/v1/products/#{m[:burger].id}/barcodes", { code: "CHAI-1" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      get "/api/v1/products/barcode_lookup", params: { code: "CHAI-1" }, headers: headers
      expect(json[:product_id]).to eq(m[:burger].id)
    end

    it "asks for another category when the product's own was archived" do
      within(owner.business) { Category.find(m[:chai].category_id).update!(archived_at: Time.current) }
      api_post "/api/v1/products/#{m[:chai].id}/restore", {}, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("product.category_archived")
      api_patch "/api/v1/products/#{m[:chai].id}", { category_id: m[:burger].category_id, active: true }, headers: headers
      expect(json).to include(archived_at: nil, category_id: m[:burger].category_id)
    end
  end

  describe "S9: deal dates are days" do
    let!(:owner) { signup_business }
    let(:headers) { auth_headers(owner) }
    let!(:m) { build_menu!(owner.business) }

    it "keeps a deal valid from today to today until the day ends in Pakistan, and sends the days back as dates" do
      travel_to Time.zone.parse("2026-11-06 16:41:00 UTC") do # 21:41 in Karachi
        api_post "/api/v1/deals", { name: "Evening box", price_minor: 50_000, valid_from: "2026-11-06", valid_to: "2026-11-06", items: [ { product_id: m[:chai].id } ] }, headers: headers
        expect(response).to have_http_status(:created), response.body
        expect(json).to include(valid_from: "2026-11-06", valid_to: "2026-11-06")
        deal = within(owner.business) { Deal.find(json[:id]) }
        expect(deal.available_at?(Time.current)).to be true
        expect(deal.available_at?(Time.zone.parse("2026-11-06 19:30 UTC"))).to be false # 00:30 on the 7th in Karachi
        api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { deal_id: deal.id } ], place: true }, headers: headers
        expect(response).to have_http_status(:created), response.body
        # The Edit form sends back what it was given: still the same day.
        api_patch "/api/v1/deals/#{deal.id}", { valid_from: "2026-11-06T00:00:00.000Z", valid_to: "2026-11-07" }, headers: headers
        expect(json).to include(valid_from: "2026-11-06", valid_to: "2026-11-07")
      end
    end

    it "refuses Valid to before Valid from" do
      api_post "/api/v1/deals", { name: "Backwards", price_minor: 50_000, valid_from: "2026-11-07", valid_to: "2026-11-06", items: [ { product_id: m[:chai].id } ] }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(json[:error][:message]).to eq("Valid to must be on or after Valid from")
    end
  end

  describe "S13: words a person reads" do
    let!(:owner) { signup_business }
    let(:headers) { auth_headers(owner) }
    let!(:m) { build_menu!(owner.business) }

    it "names the modifier group fields as the form does" do
      api_post "/api/v1/modifier_groups", { name: "Sauces", min_select: 2, max_select: 1, modifiers: [ { name: "Mint", price_minor: 0 } ] }, headers: headers
      expect(response).to have_http_status(:unprocessable_content)
      expect(json[:error][:message]).to eq("Max select cannot be less than Min select")
    end

    it "writes the orders and audit CSVs in the business's clock, and labels the audit entities" do
      travel_to Time.zone.parse("2026-11-06 16:41:00 UTC") do # 21:41 in Karachi
        api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
        get "/api/v1/exports/orders.csv", headers: headers
        expect(CSV.parse(response.body, headers: true).first["placed_at"]).to eq("2026-11-06 21:41:00")
        get "/api/v1/exports/audit_logs.csv", headers: headers
        times = CSV.parse(response.body, headers: true).map { |r| r["occurred_at"] }
        expect(times).to all(match(/\A\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\z/))
        expect(times).to include(start_with("2026-11-06 21:41"))
      end
      get "/api/v1/audit_logs/entities", headers: headers
      expect(json[:entity_labels]).to include(orders: "Orders")
      expect(json[:entity_labels].values).not_to include("order_items")
    end
  end

  describe "S10: the setup checklist" do
    it "ticks the business item only with a name, phone and logo, and the hours item when the business day is saved" do
      s = sign_up
      h = headers_for(s)
      api_patch "/api/v1/business", { phone: "+923001234567" }, headers: h
      get "/api/v1/setup_checklist", headers: h
      items = json[:data].index_by { |i| i[:key] }
      expect(items["business_info"][:done]).to be false
      api_patch "/api/v1/business", { logo_key: "logos/abc.png" }, headers: h
      api_patch "/api/v1/branches/#{s[:branch][:id]}", { business_day_start: "09:00", day_end_time: "02:01" }, headers: h
      get "/api/v1/setup_checklist", headers: h
      items = json[:data].index_by { |i| i[:key] }
      expect(items["business_info"][:done]).to be true
      expect(items["branch_hours"][:done]).to be true
    end
  end

  it "end to end: signs up, builds a menu, a category and a product without a discount, sells it and prints the receipt" do
    s = sign_up
    h = headers_for(s)
    api_patch "/api/v1/settings", { values: { "pos.receipt.header" => "Fresh every morning", "pos.receipt.footer" => "Shukriya, come again" } }, headers: h
    api_patch "/api/v1/branches/#{s[:branch][:id]}", { tax_registration: { authority: "pra", ntn: "1234567-8", pos_id: "POS-9", token: "PRA-LIVE-TOKEN-9999" } }, headers: h
    expect(response).to have_http_status(:ok)
    api_post "/api/v1/menus", { name: "All day" }, headers: h
    menu_id = json[:id]
    api_post "/api/v1/categories", { name: "Tea", menu_id: menu_id }, headers: h
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/products", { category_id: json[:id], name: "Doodh patti", base_price_minor: 12_000, discount_value: nil, discount_type: nil }, headers: h
    expect(response).to have_http_status(:created), response.body
    product_id = json[:id]
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: product_id, quantity: 2 } ], place: true }, headers: h
    expect(response).to have_http_status(:created), response.body
    order_id = json[:id]
    api_post "/api/v1/orders/#{order_id}/payments", { payments: [ { method_code: "cash", amount_minor: json[:total_minor] } ] }, headers: h
    expect(response).to have_http_status(:created), response.body
    get "/api/v1/orders/#{order_id}/receipt", headers: h
    expect(response).to have_http_status(:ok)
    expect(json).to include(header: "Fresh every morning", footer: "Shukriya, come again", paper: "80")
    expect(json[:business][:currency]).to eq("PKR")
    expect(json[:branch][:tax_registration]).to eq(authority: "pra", ntn: "1234567-8", pos_id: "POS-9")
    expect(json[:lines].map { |l| l[:name] }).to eq([ "Doodh patti" ])
    expect(response.body).not_to include("PRA-LIVE-TOKEN-9999")
  end
end

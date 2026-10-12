require "rails_helper"

# Barcodes and QR codes on products (12 Oct 2026): several codes per product, per size and per pack, unique per
# business, sent to the till in the catalog and sync, looked up when scanned, attached from the till with a manager
# PIN, free in-store codes, and the scanner settings.
RSpec.describe "Product barcodes", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:m) { build_menu!(biz) }

  it "saves codes per size and per pack with the product, ships them to the till and finds a product by its code" do
    api_put "/api/v1/products/#{m[:burger].id}", { variants: [ { id: m[:double].id, name: "Double", price_minor: 65_000 }, { name: "Family", price_minor: 120_000 } ],
                                                    barcodes: [ { code: "8961000000013" }, { code: "8961000000020", variant_name: "Family" }, { code: "BOX-6", quantity: 6, variant_id: m[:double].id } ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    codes = json[:barcodes].index_by { |b| b[:code] }
    family = json[:variants].find { |v| v[:name] == "Family" }
    expect(codes["8961000000020"][:variant_id]).to eq(family[:id])
    expect(codes["BOX-6"]).to include(quantity: "6.0", variant_id: m[:double].id)

    get "/api/v1/catalog", headers: headers
    expect(json[:products].find { |p| p[:id] == m[:burger].id }[:barcodes].size).to eq(3)
    expect(json[:business][:settings]).to include("pos.barcode_scanning.terminator": "enter", "pos.barcode_scanning.min_length": 4)

    get "/api/v1/products/barcode_lookup", params: { code: "BOX-6" }, headers: headers
    expect(json).to include(product_id: m[:burger].id, variant_name: "Double", quantity: "6.0", format: "code128")
    get "/api/v1/products/barcode_lookup", params: { code: "8961000000013" }, headers: headers
    expect(json[:format]).to eq("ean13")
    api_put "/api/v1/products/#{m[:chai].id}", { barcodes: [ { code: "036000291452" } ] }, headers: headers # UPC-A
    get "/api/v1/products/barcode_lookup", params: { code: "0036000291452" }, headers: headers # the same code scanned as EAN-13
    expect(json[:product_id]).to eq(m[:chai].id)
    get "/api/v1/products/barcode_lookup", params: { code: "nope" }, headers: headers
    expect(response).to have_http_status(:not_found)
    expect(json[:error][:code]).to eq("barcode.unknown")
    get "/api/v1/products", params: { q: "8961000000020" }, headers: headers
    expect(json[:data].map { |p| p[:id] }).to eq([ m[:burger].id ])
    get "/api/v1/products/barcodes", headers: headers
    expect(json[:data].size).to eq(4) # three on the burger, the UPC-A on chai

    # Removing a size frees its code; the same request may not list a code twice or take another product's code.
    api_put "/api/v1/products/#{m[:chai].id}", { barcodes: [ { code: "8961000000013" } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:message]).to include("Zinger Burger")
    api_put "/api/v1/products/#{m[:chai].id}", { barcodes: [ { code: "X1" }, { code: "X1" } ] }, headers: headers
    expect(json[:error][:code]).to eq("barcode.duplicate")
  end

  it "frees the codes of an archived product and lets the sync carry barcode changes" do
    api_put "/api/v1/products/#{m[:chai].id}", { barcodes: [ { code: "CHAI-1" } ] }, headers: headers
    delete "/api/v1/products/#{m[:chai].id}", headers: headers
    api_put "/api/v1/products/#{m[:burger].id}", { barcodes: [ { code: "CHAI-1" } ] }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:barcodes].map { |b| b[:code] }).to eq([ "CHAI-1" ])
  end

  it "attaches an unknown code from the till: a cashier needs a manager PIN, a taken code is refused" do
    cashier = add_member!(biz, "cashier")
    add_member!(biz, "manager", pin: "2468")
    ch = auth_headers(cashier)
    api_post "/api/v1/products/#{m[:chai].id}/barcodes", { code: "6291041500213" }, headers: ch
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("approval.required")
    api_post "/api/v1/products/#{m[:chai].id}/barcodes", { code: "6291041500213", approver_pin: "2468" }, headers: ch
    expect(response).to have_http_status(:created)
    expect(json[:product][:barcodes].map { |b| b[:code] }).to eq([ "6291041500213" ])
    get "/api/v1/products/barcode_lookup", params: { code: "6291041500213" }, headers: ch
    expect(json[:product_id]).to eq(m[:chai].id)
    api_post "/api/v1/products/#{m[:burger].id}/barcodes", { code: "6291041500213" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("barcode.taken")
    bid = within(biz) { ProductBarcode.find_by(code: "6291041500213").id }
    delete "/api/v1/products/#{m[:chai].id}/barcodes/#{bid}", headers: headers
    expect(response).to have_http_status(:no_content)
  end

  it "generates free in-store EAN-13 codes with valid check digits" do
    api_post "/api/v1/products/barcodes/generate", { count: 5 }, headers: headers
    codes = json[:codes]
    expect(codes.size).to eq(5)
    expect(codes).to all(match(/\A20\d{11}\z/))
    expect(codes.map { |c| Catalog::Barcodes.valid_ean?(c) }).to all(be(true))
    expect(Catalog::Barcodes.format_of("https://easalpha.com/x")).to eq("qr")
    expect(Catalog::Barcodes.format_of("036000291452")).to eq("upca")
    expect(Catalog::Barcodes.format_of("96385074")).to eq("ean8")
  end

  it "keeps the scanner settings in the settings store" do
    api_patch "/api/v1/settings", { values: { "pos.barcode_scanning.enabled" => true, "pos.barcode_scanning.prefix" => "]E0", "pos.barcode_scanning.scale_barcodes" => true } }, headers: headers
    expect(response).to have_http_status(:ok)
    get "/api/v1/settings", headers: headers
    keys = json[:groups][:point_of_sale][:screens][:"Barcode Scanning"].index_by { |k| k[:key] }
    expect(keys["pos.barcode_scanning.prefix"][:value]).to eq("]E0")
    expect(keys["pos.barcode_scanning.scale_prefixes"][:value]).to eq("21,22")
  end
end

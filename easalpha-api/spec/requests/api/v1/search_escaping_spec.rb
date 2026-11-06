require "rails_helper"

# Review of 6 Nov 2026, R14: a user's % and _ went into ILIKE as wildcards ("50%" also found "500 g", "A_1" found
# "AB1"), the receipt number included. Searches now take them literally, and a receipt number is an exact,
# case-insensitive match.
RSpec.describe "Searches take % and _ literally", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let!(:m) { build_menu!(biz) }

  def names(path, q, key: :name)
    get path, params: { q: q }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    json[:data].map { |r| r[key] }
  end

  describe "orders" do
    def order!(**attrs)
      within(biz) do
        o = Orders::Builder.create!({ order_type: "takeaway" }, lines: [ { product_id: m[:chai].id } ], actor: owner, device: nil, branch: Branch.first).order
        o.update_columns(attrs)
        o
      end
    end

    it "finds a receipt number by equality, in any case, and a _ in it is not a wildcard" do
      paid = order!(receipt_number: "261106-B1-12")
      order!(receipt_number: "261106-B1-120")
      expect(names("/api/v1/orders", "261106-b1-12", key: :id)).to eq([ paid.id ])
      expect(names("/api/v1/orders", "261106-B_-12", key: :id)).to eq([])
      expect(names("/api/v1/orders", "261106-B%-12", key: :id)).to eq([])
    end

    it "finds the receipt of a branch whose code predates the A-Z and 0-9 rule, a space included" do
      odd = order!(receipt_number: "261106-DHA 2-7")
      expect(names("/api/v1/orders", "261106-DHA 2-7", key: :id)).to eq([ odd.id ])
    end

    it "matches % and _ in the text search as themselves" do
      half = order!(notes: "50% off for staff")
      order!(notes: "500 rupees change")
      underscored = order!(guest_name: "A_1")
      order!(guest_name: "AB1")
      expect(names("/api/v1/orders", "50%", key: :id)).to eq([ half.id ])
      expect(names("/api/v1/orders", "A_1", key: :id)).to eq([ underscored.id ])
    end
  end

  it "does the same for products, suppliers and employees" do
    within(biz) do
      category = Category.first
      Product.create!(category: category, name: "Tea 50% off", base_price_minor: 5_000)
      Product.create!(category: category, name: "Tea 500 g", base_price_minor: 9_000)
      Supplier.create!(name: "Metro_Cash")
      Supplier.create!(name: "MetroXCash")
      Employee.create!(name: "Ali_Raza")
      Employee.create!(name: "AliXRaza")
    end
    expect(names("/api/v1/products", "50%")).to eq([ "Tea 50% off" ])
    expect(names("/api/v1/suppliers", "o_C")).to eq([ "Metro_Cash" ])
    expect(names("/api/v1/employees", "i_R")).to eq([ "Ali_Raza" ])
    within(biz) { expect(Canteen::Workers.search("i_R").map(&:name)).to eq([ "Ali_Raza" ]) }
  end

  it "does the same in the stock report" do
    within(biz) do
      Unit.seed_defaults!
      pcs = Unit.find_by!(code: "pcs")
      StockItem.create!(name: "Cups 100%", base_unit: pcs)
      StockItem.create!(name: "Cups 1000", base_unit: pcs)
      expect(Reports::Stock.levels(q: "100%")[:rows].map { |r| r[:item][:name] }).to eq([ "Cups 100%" ])
    end
  end

  it "does the same in the super admin's business search" do
    signup_business(name: "Cafe 100% Halal")
    signup_business(name: "Cafe 1000 Halal")
    admin = create(:super_admin)
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    get "/api/v1/super/businesses", params: { q: "100%" }, headers: { "Authorization" => "Bearer #{json[:access_token]}" }
    expect(json[:data].map { |b| b[:name] }).to eq([ "Cafe 100% Halal" ])
  end
end

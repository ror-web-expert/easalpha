require "rails_helper"

# QA T2 (6 Nov 2026): a coupon was priced from its value and kind alone. A Rs 5,000 minimum applied to a Rs 480 order,
# "50% off Chai only" came off the whole order, and three coupons stacked on one order. The promotion's own rules now
# decide: its minimum order, the products or categories it is for, and one coupon per order (promotions carry no
# stacking field, and the SPEC names none).
RSpec.describe "Coupon rules", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) } # Zinger Burger Rs 450, Chai Rs 80, both 16% on top
  let(:headers) { auth_headers(owner) }

  def coupon!(code, **attrs) = within(biz) { Promotion.create!({ name: code.titleize, kind: "coupon", value: 20, coupon_code: code }.merge(attrs)) }

  def order!(lines)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def apply(order, code) = api_post("/api/v1/orders/#{order[:id]}/discounts", { kind: "promotion", coupon_code: code }, headers: headers)

  let(:burger_and_chai) { [ { product_id: m[:burger].id, quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }

  describe "minimum order" do
    it "refuses a coupon below its minimum with what the order comes to, and takes it once the order reaches it" do
      coupon!("BIG20", min_order_minor: 500_000)
      o = order!(burger_and_chai) # Rs 530 before tax
      apply(o, "BIG20")
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "coupon.min_order", details: { min_order_minor: 500_000, order_minor: 53_000 })
      expect(json[:error][:message]).to eq("BIG20 needs an order of Rs 5,000 or more; this order comes to Rs 530")
      within(biz) { expect(Promotion.find_by!(coupon_code: "BIG20").units_sold).to eq(0) }

      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: o[:items][0][:id], quantity: 11 }, { id: o[:items][1][:id], quantity: 1 } ] }, headers: headers # Rs 5,030
      apply(o, "BIG20")
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discount_minor]).to eq(100_600) # 20% of Rs 5,030
    end

    it "gives nothing while an edit takes the order below the minimum, and comes back when it is reached again" do
      coupon!("BIG20", min_order_minor: 500_000)
      o = order!([ { product_id: m[:burger].id, quantity: 12 } ]) # Rs 5,400
      apply(o, "BIG20")
      expect(json[:discount_minor]).to eq(108_000)
      line = json[:items].first[:id]
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line, quantity: 2 } ] }, headers: headers # Rs 900
      expect(json).to include(discount_minor: 0, total_minor: 104_400)
      expect(json[:discounts].map { |d| d[:amount_minor] }).to eq([ 0 ])
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: line, quantity: 12 } ] }, headers: headers
      expect(json[:discount_minor]).to eq(108_000)
    end
  end

  describe "the products or categories a coupon is for" do
    it "takes a product coupon off that product's lines only, so its tax falls with it" do
      coupon!("CHAI50", value: 50, applies_to: "product", target_ids: [ m[:chai].id ])
      o = order!(burger_and_chai)
      apply(o, "CHAI50")
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discount_minor]).to eq(4_000) # half of the Rs 80 chai, not Rs 265 off the order
      burger, chai = json[:items].partition { |i| i[:name] == "Zinger Burger" }.map(&:first)
      expect(burger).to include(line_discount_minor: 0, line_tax_minor: 7_200)
      expect(chai).to include(line_discount_minor: 4_000, line_tax_minor: 640)
      expect(json[:total_minor]).to eq(45_000 + 7_200 + 4_000 + 640)
    end

    it "takes a category coupon off the lines of that category" do
      drinks = within(biz) { m[:chai].category_id }
      coupon!("DRINKS10", value: 10, applies_to: "category", target_ids: [ drinks ])
      o = order!(burger_and_chai + [ { product_id: m[:chai].id, quantity: 2 } ])
      apply(o, "DRINKS10")
      expect(json[:discount_minor]).to eq(2_400) # 10% of the three chai, Rs 240
      expect(json[:items].find { |i| i[:name] == "Zinger Burger" }[:line_discount_minor]).to eq(0)
    end

    it "refuses a coupon for products the order does not have" do
      coupon!("CHAI50", value: 50, applies_to: "product", target_ids: [ m[:chai].id ])
      o = order!([ { product_id: m[:burger].id, quantity: 1 } ])
      apply(o, "CHAI50")
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "coupon.no_items", message: "CHAI50 is for Chai only: add it to the order first")
    end

    it "keeps a fixed product coupon to what those lines come to" do
      coupon!("CHAIFREE", kind: "fixed", value: 200, applies_to: "product", target_ids: [ m[:chai].id ])
      o = order!(burger_and_chai)
      apply(o, "CHAIFREE")
      expect(json[:discount_minor]).to eq(8_000) # Rs 200 off a Rs 80 chai is the chai, not Rs 200 off the burger too
    end
  end

  describe "stacking" do
    it "takes one coupon per order: a second one is refused until the first is removed" do
      coupon!("TEN", value: 10)
      coupon!("FIX100", kind: "fixed", value: 100)
      o = order!(burger_and_chai)
      apply(o, "TEN")
      expect(response).to have_http_status(:ok)
      apply(o, "FIX100")
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "coupon.one_per_order", message: "TEN is already on this order: remove it to use FIX100")
      get "/api/v1/orders/#{o[:id]}", headers: headers
      expect(json[:discounts].size).to eq(1)

      delete "/api/v1/orders/#{o[:id]}/discounts/#{json[:discounts].first[:id]}", headers: headers
      expect(response).to have_http_status(:ok), response.body
      apply(o, "FIX100")
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discount_minor]).to eq(10_000)
    end

    it "gives a removed coupon its use back, so a one-use offer is not spent" do
      coupon!("BDAY", value: 10, unit_limit: 1)
      o = order!(burger_and_chai)
      apply(o, "BDAY")
      within(biz) { expect(Promotion.find_by!(coupon_code: "BDAY").units_sold).to eq(1) }
      delete "/api/v1/orders/#{o[:id]}/discounts/#{json[:discounts].first[:id]}", headers: headers
      expect(response).to have_http_status(:ok), response.body
      within(biz) { expect(Promotion.find_by!(coupon_code: "BDAY").units_sold).to eq(0) }
      apply(order!(burger_and_chai), "BDAY")
      expect(response).to have_http_status(:ok), response.body # not coupon.unavailable
    end
  end
end

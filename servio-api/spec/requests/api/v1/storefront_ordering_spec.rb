require "rails_helper"

RSpec.describe "Storefront online ordering", type: :request do
  let!(:owner) { signup_business }
  let(:business) { owner.business }
  let!(:menu) { build_menu!(business) }
  let(:product) { within(business) { Product.active.first } }
  let(:price) { product.base_price_minor }

  before do
    within(business) do
      cfg = WebsiteConfig.for_business!
      # minimum order is three of the product, free delivery from six
      cfg.update!(published: true, slug: "karachi-grill", sections: cfg.sections.deep_merge("delivery" => { "enabled" => true, "min_order_minor" => price * 3, "free_above_minor" => price * 6, "eta_minutes" => 40 }))
      business.update!(settings: business.settings.merge("charges.delivery_charge.mode" => "fixed", "charges.delivery_charge.value" => 150))
    end
  end

  def place(body) = api_post("/api/v1/public/storefront/karachi-grill/orders", body)

  it "places a delivery order that waits for the cashier, saves the customer and address, and can be tracked" do
    place(lines: [{ product_id: product.id, quantity: 3 }], order_type: "delivery", customer: { name: "Ayesha Khan", phone: "0300 1234567", address: "12 Main Boulevard", city: "Lahore" }, notes: "Less spicy")
    expect(response).to have_http_status(:created), response.body
    expect(json[:stage]).to eq("waiting")
    expect(json[:order_type]).to eq("delivery")
    expect(json[:eta_minutes]).to eq(40)
    expect(json[:items].first[:quantity]).to eq("3")
    expect(json[:customer][:address]).to include("12 Main Boulevard, Lahore")
    id = json[:id]; token = json[:guest_token]
    within(business) do
      o = Order.find(id)
      expect(o.source).to eq("online")
      expect(o.qr_status).to eq("pending")
      expect(o.customer.phone).to eq("+923001234567")
      expect(o.customer.source).to eq("online")
      expect(o.address.line1).to eq("12 Main Boulevard")
      expect(o.notes).to eq("Less spicy")
      expect(Notification.find_by(kind: "online_order")).to be_present
    end

    get "/api/v1/public/storefront/karachi-grill/orders/#{id}", params: { guest_token: token }
    expect(json[:stage]).to eq("waiting")
    get "/api/v1/public/storefront/karachi-grill/orders/#{id}", params: { guest_token: "wrong" }
    expect(response).to have_http_status(:not_found)

    # The cashier sees it beside the QR orders and accepts it; the guest sees the stage move on.
    get "/api/v1/qr_orders", headers: auth_headers(owner)
    expect(json[:data].map { |r| r[:id] }).to include(id)
    expect(json[:data].find { |r| r[:id] == id }[:address_text]).to include("12 Main Boulevard")
    api_post "/api/v1/qr_orders/#{id}/accept", {}, headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    get "/api/v1/public/storefront/karachi-grill/orders/#{id}", params: { guest_token: token }
    expect(json[:stage]).to eq("accepted")
    expect(json[:label]).to be_present

    # The same phone reuses the customer on the next order.
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "takeaway", customer: { name: "Ayesha Khan", phone: "+92 300 1234567" })
    expect(response).to have_http_status(:created), response.body
    within(business) { expect(Customer.where(phone: "+923001234567").count).to eq(1) }
  end

  it "applies the delivery charge, waives it above the free threshold, and enforces the minimum order" do
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:code]).to eq("online.min_order")
    place(lines: [{ product_id: product.id, quantity: 3 }], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:created), response.body
    expect(json[:delivery_charge_minor]).to eq(15_000)
    place(lines: [{ product_id: product.id, quantity: 6 }], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:created), response.body
    expect(json[:delivery_charge_minor]).to eq(0)
  end

  it "refuses bad input and closed ordering with clear codes" do
    place(lines: [], order_type: "takeaway", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.empty")
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "dine_in", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.order_type")
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "takeaway", customer: { name: "", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.name")
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "takeaway", customer: { name: "A", phone: "12" })
    expect(json[:error][:code]).to eq("online.phone")
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "delivery", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.address")
    within(business) { c = WebsiteConfig.for_business!; c.update!(sections: c.sections.deep_merge("availability" => { "online_ordering" => false, "closed_message" => "Back at 5 pm" })) }
    place(lines: [{ product_id: product.id, quantity: 1 }], order_type: "takeaway", customer: { name: "A", phone: "03001112233" })
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:message]).to eq("Back at 5 pm")
    post "/api/v1/public/storefront/nobody/orders", params: { lines: [] }
    expect(response).to have_http_status(:not_found)
  end
end

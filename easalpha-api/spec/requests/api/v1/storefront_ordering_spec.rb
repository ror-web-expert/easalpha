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
    place(lines: [ { product_id: product.id, quantity: 3 } ], order_type: "delivery", customer: { name: "Ayesha Khan", phone: "0300 1234567", address: "12 Main Boulevard", city: "Lahore" }, notes: "Less spicy")
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
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "Ayesha Khan", phone: "+92 300 1234567" })
    expect(response).to have_http_status(:created), response.body
    within(business) { expect(Customer.where(phone: "+923001234567").count).to eq(1) }
  end

  it "applies the delivery charge, waives it above the free threshold, and enforces the minimum order" do
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:code]).to eq("online.min_order")
    place(lines: [ { product_id: product.id, quantity: 3 } ], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:created), response.body
    expect(json[:delivery_charge_minor]).to eq(15_000)
    place(lines: [ { product_id: product.id, quantity: 6 } ], order_type: "delivery", customer: { name: "Bilal", phone: "03001112233", address: "Street 5" })
    expect(response).to have_http_status(:created), response.body
    expect(json[:delivery_charge_minor]).to eq(0)
  end

  it "refuses bad input and closed ordering with clear codes" do
    place(lines: [], order_type: "takeaway", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.empty")
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "dine_in", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.order_type")
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.name")
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "A", phone: "12" })
    expect(json[:error][:code]).to eq("online.phone")
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "delivery", customer: { name: "A", phone: "03001112233" })
    expect(json[:error][:code]).to eq("online.address")
    within(business) { c = WebsiteConfig.for_business!; c.update!(sections: c.sections.deep_merge("availability" => { "online_ordering" => false, "closed_message" => "Back at 5 pm" })) }
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "A", phone: "03001112233" })
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:message]).to eq("Back at 5 pm")
    post "/api/v1/public/storefront/nobody/orders", params: { lines: [] }
    expect(response).to have_http_status(:not_found)
  end

  # Review of 6 Nov 2026, A11: the storefront never verifies a phone, so a guest cannot claim a till customer's account
  # or their regular discount by typing their number.
  it "attaches nobody when the phone belongs to a customer the till knows, and gives online orders no regular discount" do
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: auth_headers(owner)
    regular = within(business) { Customer.create!(name: "Rao Bilal", phone: "+923005556677", source: "in_store", khata_no: 7, last_order_at: 1.day.ago) }
    place(lines: [ { product_id: product.id, quantity: 3 } ], order_type: "delivery", customer: { name: "Someone", phone: "0300 5556677", address: "House 9", city: "Lahore" }, notes: "Ring the bell")
    expect(response).to have_http_status(:created), response.body
    within(business) do
      o = Order.find(json[:id])
      expect(o.customer_id).to be_nil
      expect(o.guest_name).to eq("Someone")
      expect(o.notes).to include("+923005556677", "Deliver to: House 9, Lahore", "Ring the bell")
      expect(o.discounts).to be_empty
      expect(regular.reload.last_order_at).to be_within(1.minute).of(1.day.ago)
      expect(Customer.where(phone: "+923005556677").count).to eq(1)
    end

    # A customer the storefront made itself is reused, but a returning online guest earns no recency discount either.
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "Hina", phone: "03007778899" })
    within(business) { Customer.find_by!(phone: "+923007778899").update!(last_order_at: 1.day.ago) }
    place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "Hina", phone: "03007778899" })
    within(business) do
      o = Order.find(json[:id])
      expect(o.customer).to have_attributes(phone: "+923007778899", source: "online")
      expect(o.discounts).to be_empty
    end
  end

  # Review of 6 Nov 2026, A12: the guest's client id is only a retry key; the order id is the server's.
  it "answers the same order for a retried submit and never uses the client id as the order id" do
    client_id = SecureRandom.uuid
    2.times { place(lines: [ { product_id: product.id, quantity: 1 } ], order_type: "takeaway", customer: { name: "Ali", phone: "03009990000" }, client_id: client_id) }
    expect(response).to have_http_status(:created), response.body
    id = json[:id]
    expect(id).not_to eq(client_id)
    within(business) do
      expect(Order.where(source: "online").count).to eq(1)
      expect(Order.find(id).aggregator_ref).to eq("online:#{client_id}")
    end
  end
end

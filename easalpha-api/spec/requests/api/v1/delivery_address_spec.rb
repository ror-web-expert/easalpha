require "rails_helper"

# Final round of 6 Nov 2026. T3/F3: a delivery order carries its address and zone, and the zone's charge is applied
# when an address in a zone is given without a charge of its own (the till sends the one it quoted or the cashier set).
# sync-auth#6/contracts#2: a storefront guest attached to nobody keeps their name, phone and address on the order, and
# the rider, the delivery board and the cashier's queue show them.
RSpec.describe "Delivery addresses and zones", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before do
    within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      biz.update!(settings: biz.settings.merge("charges.delivery_charge.mode" => "fixed", "charges.delivery_charge.value" => 100))
    end
    api_post "/api/v1/delivery_zones", { name: "DHA", areas: [ "DHA", "Phase 5" ], charge_minor: 15_000, min_order_minor: 0, eta_minutes: 40 }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  def customer!(name, phone, address)
    api_post "/api/v1/customers", { name: name, phone: phone, addresses: [ address.merge(is_default: true) ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def rider!
    api_post "/api/v1/riders", { name: "Bilal", phone: "03111111111", vehicle: "bike", create_login: true, pin: "4321" }, headers: headers
    r = json
    [ r, auth_headers(within(biz) { Membership.find(r[:membership_id]) }, app: "rider") ]
  end

  it "applies the zone's charge to a delivery to an address in it, keeps a charge the till sends, and the delivery follows the order" do
    hira = customer!("Hira", "03005556677", { line1: "House 12", area: "Phase 5 DHA" })
    elsewhere = within(biz) { CustomerAddress.create!(customer_id: hira[:id], line1: "Shop 4", area: "Gulberg") }
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: hira[:id], address_id: hira[:addresses].first[:id], lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:delivery_charge_minor]).to eq(15_000)
    expect(json[:address_id]).to eq(hira[:addresses].first[:id])
    expect(json[:address_text]).to eq("House 12, Phase 5 DHA")
    order = json
    get "/api/v1/orders/#{order[:id]}/delivery", headers: headers
    expect(json).to include(zone_name: "DHA", charge_minor: 15_000, address_text: "House 12, Phase 5 DHA", customer_name: "Hira", phone: "+923005556677")

    # The cashier moves it to an address outside every zone: the settings' charge again, and the delivery follows.
    api_patch "/api/v1/orders/#{order[:id]}", { address_id: elsewhere.id }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:delivery_charge_minor]).to eq(10_000)
    get "/api/v1/orders/#{order[:id]}/delivery", headers: headers
    expect(json).to include(zone_id: nil, charge_minor: 10_000, address_text: "Shop 4, Gulberg")
    # A charge the till names wins over the zone's (the cashier changed it, within the existing permission).
    api_patch "/api/v1/orders/#{order[:id]}", { address_id: hira[:addresses].first[:id], delivery_charge_minor: 5_000 }, headers: headers
    expect(json[:delivery_charge_minor]).to eq(5_000)
    get "/api/v1/orders/#{order[:id]}/delivery", headers: headers
    expect(json).to include(zone_name: "DHA", charge_minor: 5_000)
  end

  it "refuses another customer's address, and drops a kept one when the customer changes" do
    hira = customer!("Hira", "03005556677", { line1: "House 12", area: "Phase 5 DHA" })
    omar = customer!("Omar", "03009998877", { line1: "Flat 3", area: "Gulberg" })
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: omar[:id], address_id: hira[:addresses].first[:id], lines: [ { product_id: m[:chai].id } ] }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:code]).to eq("order.address")

    api_post "/api/v1/orders", { order_type: "delivery", customer_id: hira[:id], address_id: hira[:addresses].first[:id], lines: [ { product_id: m[:chai].id } ] }, headers: headers
    o = json
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: omar[:id] }, headers: headers # an older till sends no address
    expect(response).to have_http_status(:ok), response.body
    expect(json[:address_id]).to be_nil
  end

  it "shows the rider and the board the address and phone of a till customer, with directions" do
    hira = customer!("Hira", "03005556677", { line1: "House 12", area: "Phase 5 DHA" })
    api_post "/api/v1/orders", { order_type: "delivery", customer_id: hira[:id], address_id: hira[:addresses].first[:id], delivery_charge_minor: 15_000, lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: headers
    order = json
    rider, rh = rider!
    api_post "/api/v1/orders/#{order[:id]}/delivery/assign", { rider_id: rider[:id] }, headers: headers
    get "/api/v1/deliveries?open=true", headers: headers
    expect(json[:data].first).to include(address_text: "House 12, Phase 5 DHA", customer_name: "Hira", phone: "+923005556677", zone_name: "DHA")
    get "/api/v1/rider/deliveries", headers: rh
    row = json[:data].first
    expect(row).to include(address_text: "House 12, Phase 5 DHA", phone: "+923005556677")
    expect(row[:address]).to include(line1: "House 12", area: "Phase 5 DHA")
    expect(row[:items]).to eq([ { name: "Zinger Burger", quantity: "2" } ]) # F13: 2, not 2.0
  end

  # Leftovers of 7 Nov 2026 (L3): the order_update replay dropped address_id, so a delivery moved to another address
  # while the till was offline kept the old one (and the old zone's charge). It now goes through the rule the online
  # PATCH applies (Orders::Builder#validate_address!).
  describe "an update queued offline" do
    let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T7") } }
    let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
    let(:pos) { auth_headers(cashier, app: "pos", device: device) }

    def queued_update(order, address_id, seq:, **payload)
      { type: "order_update", id: order[:id], membership_id: cashier.id,
        payload: { order_type: "delivery", customer_id: order[:customer_id], address_id: address_id, lines: order[:items].map { |i| { id: i[:id], product_id: i[:product_id], quantity: 1 } }, client_seq: seq }.merge(payload) }
    end

    def push(record)
      api_post "/api/v1/sync/push", { records: [ record ] }, headers: pos
      expect(response).to have_http_status(:ok), response.body
      json[:results].first
    end

    it "moves the delivery to the address it names, and refuses another customer's address as online" do
      hira = customer!("Hira", "03005556677", { line1: "House 12", area: "Phase 5 DHA" })
      omar = customer!("Omar", "03009998877", { line1: "Flat 3", area: "Gulberg" })
      elsewhere = within(biz) { CustomerAddress.create!(customer_id: hira[:id], line1: "Shop 4", area: "Gulberg") }
      api_post "/api/v1/orders", { order_type: "delivery", customer_id: hira[:id], address_id: hira[:addresses].first[:id], lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
      order = json

      expect(push(queued_update(order, elsewhere.id, seq: 1))).to include(status: "accepted")
      expect(within(biz) { Order.find(order[:id]).address_id }).to eq(elsewhere.id)
      get "/api/v1/orders/#{order[:id]}/delivery", headers: headers
      expect(json).to include(address_text: "Shop 4, Gulberg") # the delivery follows, as after an online PATCH

      expect(push(queued_update(order, omar[:addresses].first[:id], seq: 2))).to include(status: "rejected", code: "order.address")
      expect(within(biz) { Order.find(order[:id]).address_id }).to eq(elsewhere.id)
    end
  end

  context "from the storefront" do
    before do
      within(biz) do
        cfg = WebsiteConfig.for_business!
        cfg.update!(published: true, slug: "karachi-grill", sections: cfg.sections.deep_merge("delivery" => { "enabled" => true, "min_order_minor" => 0 }))
      end
    end

    def place(customer) = api_post("/api/v1/public/storefront/karachi-grill/orders", { lines: [ { product_id: m[:burger].id } ], order_type: "delivery", customer: customer, client_id: SecureRandom.uuid })

    it "charges the zone of a new guest's address" do
      place(name: "Sara", phone: "03001230000", address: "House 7, Phase 5", city: "Lahore")
      expect(response).to have_http_status(:created), response.body
      expect(json[:delivery_charge_minor]).to eq(15_000)
      place(name: "Asad", phone: "03001230001", address: "Main Road", city: "Kasur")
      expect(json[:delivery_charge_minor]).to eq(10_000)
    end

    it "keeps a guest's phone and address on the order when the phone is a till customer's, and shows them to the cashier, the rider and the board" do
      within(biz) { Customer.create!(name: "Hira", phone: "+923005556677", source: "in_store") }
      place(name: "Hira", phone: "0300 5556677", address: "House 12, Phase 5 DHA", city: "Lahore")
      expect(response).to have_http_status(:created), response.body
      expect(json[:delivery_charge_minor]).to eq(15_000) # the zone of the address typed
      expect(json[:customer]).to eq(name: "Hira", address: "House 12, Phase 5 DHA, Lahore")
      id = json[:id]
      expect(within(biz) { Order.find(id) }).to have_attributes(customer_id: nil, guest_phone: "+923005556677", delivery_address: "House 12, Phase 5 DHA, Lahore", notes: nil)

      get "/api/v1/qr_orders?status=pending", headers: headers
      expect(json[:data].find { |r| r[:id] == id }).to include(address_text: "House 12, Phase 5 DHA, Lahore", guest_phone: "+923005556677", guest_name: "Hira")
      api_post "/api/v1/qr_orders/#{id}/accept", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body

      rider, rh = rider!
      api_post "/api/v1/orders/#{id}/delivery/assign", { rider_id: rider[:id] }, headers: headers
      get "/api/v1/deliveries?open=true", headers: headers
      expect(json[:data].first).to include(order_id: id, address_text: "House 12, Phase 5 DHA, Lahore", customer_name: "Hira", phone: "+923005556677", zone_name: "DHA")
      get "/api/v1/rider/deliveries", headers: rh
      expect(json[:data].first).to include(address_text: "House 12, Phase 5 DHA, Lahore", phone: "+923005556677", customer: nil, address: nil)
      get "/api/v1/orders/#{id}", headers: headers
      expect(json).to include(address_text: "House 12, Phase 5 DHA, Lahore", guest_phone: "+923005556677")
    end
  end
end

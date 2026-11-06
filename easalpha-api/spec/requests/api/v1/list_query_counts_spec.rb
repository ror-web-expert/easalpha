require "rails_helper"

# Leftovers of 7 Nov 2026 (L3), query speed. The QR menu loaded the business once per deal (Deal#available_at? reads
# its time zone) and the barcodes once per product; a rider's deliveries list loaded each delivery's address one by
# one, and the settlement preview each delivery's address, zone, rider and customer. Each list is read with few rows
# and with more: its queries must not grow with the rows.
RSpec.describe "Query counts of the QR menu and the rider lists", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  # The SELECTs a block runs, by table. Answers from the query cache count too: a lookup per row is one per row even
  # when the cache answers it, and outside a request nothing answers it.
  def selects
    counts = Hash.new(0)
    count = ->(*, p) { counts[p[:sql][/\bFROM "(\w+)"/, 1]] += 1 if p[:name] != "SCHEMA" && p[:sql].lstrip.start_with?("SELECT") }
    ActiveSupport::Notifications.subscribed(count, "sql.active_record") { yield }
    counts
  end

  it "reads the QR menu with the same queries for one deal and product as for six" do
    table = within(biz) { DiningTable.create!(branch: Branch.first, code: "T1", name: "Table 1", seats: 4) }
    within(biz) { table.branch.update!(qr_settings: { "enabled" => true }) }
    menu = -> { selects { within(biz) { Qr::Ordering.menu(table.reload) } } }
    menu.call # the first read loads what every later one finds ready
    before = menu.call
    within(biz) do
      5.times do |i|
        Deal.create!(name: "Deal #{i}", price_minor: 60_000).deal_items.create!(product: m[:burger], quantity: 1)
        Product.create!(category: m[:burger].category, name: "Wrap #{i}", base_price_minor: 30_000).barcodes.create!(code: "200000000#{i}")
      end
    end
    after = menu.call
    expect(within(biz) { Qr::Ordering.menu(table.reload) }).to include(deals: have_attributes(size: 6), products: have_attributes(size: 7))
    expect(after).to eq(before)
  end

  # Orders::Builder#build_deal_item read each deal by itself, then its business (Deal#available_at?'s time zone) and
  # tax rate, and the category of each part (for its station): an order of three deals with twelve parts read twelve.
  it "places an order of three deals with the catalogue reads of an order of one" do
    family = within(biz) do
      d = Deal.create!(name: "Family Box", price_minor: 200_000, tax_rate: m[:tax])
      4.times { |i| d.deal_items.create!(product: Product.create!(category: m[:burger].category, name: "Part #{i}", base_price_minor: 10_000), quantity: 1) }
      d.deal_items.create!(product: m[:chai], quantity: 2)
      d
    end
    place = ->(lines) { selects { api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }, headers: headers } }
    place.call([ { deal_id: m[:deal].id } ])
    one = place.call([ { deal_id: m[:deal].id } ])
    three = place.call([ { deal_id: m[:deal].id }, { deal_id: family.id }, { deal_id: family.id } ])
    expect(response).to have_http_status(:created), response.body
    expect(json[:items].map { |i| i[:deal_components].size }).to eq([ 2, 5, 5 ])
    catalogue = %w[deals deal_items products categories tax_rates]
    expect(three.slice(*catalogue)).to eq(one.slice(*catalogue))
    # Each order item saved reads its business (Tenanted's required belongs_to), the two added lines at most; a deal adds none.
    expect(three["businesses"] - one["businesses"]).to be <= 2
  end

  describe "a rider's deliveries" do
    before do
      api_post "/api/v1/delivery_zones", { name: "Gulberg", areas: [ "Gulberg" ], charge_minor: 10_000, min_order_minor: 0, eta_minutes: 30 }, headers: headers
      expect(response).to have_http_status(:created), response.body
      api_post "/api/v1/riders", { name: "Asad", phone: "03122222222", create_login: true, pin: "4321" }, headers: headers
      @rider = json
    end

    # A delivery of a customer of its own, to their saved address, delivered with the cash collected.
    def delivered!(n)
      n.times do
        i = (@made = @made.to_i + 1)
        api_post "/api/v1/customers", { name: "Guest #{i}", phone: "030012300#{format('%02d', i)}", addresses: [ { line1: "Flat #{i}", area: "Gulberg" } ] }, headers: headers
        cust = json
        api_post "/api/v1/orders", { order_type: "delivery", customer_id: cust[:id], address_id: cust[:addresses].first[:id], lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
        order = json
        api_post "/api/v1/orders/#{order[:id]}/delivery/assign", { rider_id: @rider[:id] }, headers: headers
        api_post "/api/v1/orders/#{order[:id]}/delivery/status", { status: "picked_up" }, headers: headers
        api_post "/api/v1/orders/#{order[:id]}/delivery/status", { status: "delivered", cash_collected_minor: order[:total_minor] }, headers: headers
        expect(response).to have_http_status(:ok), response.body
      end
    end

    it "lists them and previews the settlement with the same queries for one delivery as for four" do
      delivered!(1)
      list = -> { selects { get "/api/v1/riders/#{@rider[:id]}/deliveries", headers: headers } }
      preview = -> { selects { get "/api/v1/riders/#{@rider[:id]}/settlement_preview", headers: headers } }
      list.call
      preview.call
      before = [ list.call, preview.call ]
      delivered!(3)
      after = [ list.call, preview.call ]
      expect(json[:deliveries].map { |d| [ d[:address_text], d[:zone_name], d[:rider_name] ] }.sort).to eq((1..4).map { |i| [ "Flat #{i}, Gulberg", "Gulberg", "Asad" ] })
      expect(after).to eq(before)
    end

    # GET /rider/deliveries (up to 100 rows, each with its lines and its status history) loaded both one by one.
    it "gives the rider app its list with the same queries for one delivery as for four" do
      rider_app = auth_headers(within(biz) { Membership.find(@rider[:membership_id]) }, app: "rider")
      delivered!(1)
      mine = -> { selects { get "/api/v1/rider/deliveries", params: { all: "true" }, headers: rider_app } }
      mine.call
      before = mine.call
      delivered!(3)
      after = mine.call
      expect(response).to have_http_status(:ok), response.body
      expect(json[:data].map { |d| [ d[:address_text], d[:items], d[:events].last[:status] ] }.sort).to eq((1..4).map { |i| [ "Flat #{i}, Gulberg", [ { name: "Chai", quantity: "1" } ], "delivered" ] })
      expect(after).to eq(before)
    end
  end
end

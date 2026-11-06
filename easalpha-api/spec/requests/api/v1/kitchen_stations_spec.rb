require "rails_helper"

# Final round of 6 Nov 2026: a kitchen screen paired by code reads its stations (F9); "Bump order" on a station's screen
# bumps that station's lines only, and the order is ready once every station's are (F10); the queue and token screens
# show what the kitchen display shows (F12).
RSpec.describe "Kitchen stations, bumps and the customers' screens", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let!(:m) { build_menu!(biz) }
  let(:kds) { within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current) } }
  let(:screen) { within(biz) { Device.create!(branch: Branch.first, name: "Queue", kind: "token_screen", paired_at: Time.current) } }

  def placed(lines, **extra)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines, place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def statuses(order_id) = within(biz) { Order.find(order_id).items.map { |i| [ i.name_snapshot, i.status ] }.sort }

  it "gives a screen paired as a kitchen display its branch's stations" do
    other = within(biz) { Branch.create!(name: "Gulberg", code: "GLB") }
    within(biz) { Station.create!(branch: other, name: "Tandoor") }
    get "/api/v1/stations", headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:data].map { |s| s[:name] }).to contain_exactly("Grill", "Drinks")
    get "/api/v1/stations", headers: device_headers(screen)
    expect(response).to have_http_status(:unauthorized)
    get "/api/v1/stations", headers: headers
    expect(json[:data].map { |s| s[:name] }).to contain_exactly("Grill", "Drinks", "Tandoor")
  end

  it "bumps one station's lines from its screen, and the order once every station is done" do
    o = placed([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ])
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", { station_id: m[:grill].id }, headers: device_headers(kds)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("preparing")
    expect(statuses(o[:id])).to eq([ [ "Chai", "sent" ], [ "Zinger Burger", "ready" ] ])

    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", { station_id: m[:drinks].id }, headers: device_headers(kds)
    expect(json[:status]).to eq("ready")
    expect(statuses(o[:id])).to eq([ [ "Chai", "ready" ], [ "Zinger Burger", "ready" ] ])
    expect(within(biz) { OrderStatusEvent.where(order_id: o[:id], to_status: "ready").count }).to eq(1)
  end

  it "readies lines that belong to no station with the last station, by order bump or line bump" do
    loose = within(biz) { Product.create!(category: Category.create!(menu: m[:menu], name: "Counter"), name: "Water", base_price_minor: 5_000) }
    o = placed([ { product_id: m[:burger].id }, { product_id: loose.id } ])
    api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", { station_id: m[:grill].id }, headers: device_headers(kds)
    expect(json[:status]).to eq("ready")
    expect(statuses(o[:id])).to eq([ [ "Water", "ready" ], [ "Zinger Burger", "ready" ] ])

    o2 = placed([ { product_id: m[:burger].id }, { product_id: m[:chai].id }, { product_id: loose.id } ])
    burger, chai = %w[Zinger\ Burger Chai].map { |n| o2[:items].find { |i| i[:name] == n }[:id] }
    api_post "/api/v1/kitchen/items/#{burger}/bump", {}, headers: device_headers(kds)
    expect(json[:status]).to eq("preparing")
    api_post "/api/v1/kitchen/items/#{chai}/bump", {}, headers: device_headers(kds)
    expect(json[:status]).to eq("ready")
  end

  it "shows on the queue and token screens only what the kitchen display shows" do
    today = today_for(biz)
    now = placed([ { product_id: m[:burger].id } ])
    tomorrow = placed([ { product_id: m[:chai].id } ], scheduled_for: 1.day.from_now.iso8601, guest_name: "Office lunch")
    stale = placed([ { product_id: m[:chai].id } ])
    old_ready = placed([ { product_id: m[:chai].id } ])
    api_post "/api/v1/kitchen/orders/#{old_ready[:id]}/bump", {}, headers: device_headers(kds)
    within(biz) { Order.where(id: [ stale[:id], old_ready[:id] ]).update_all(business_day: today - 2) }

    get "/api/v1/kitchen/orders", headers: device_headers(kds)
    shown = json[:data].map { |o| o[:id] }
    expect(shown).to eq([ now[:id] ])
    get "/api/v1/kitchen/queue", headers: device_headers(screen)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:preparing].map { |o| o[:id] }).to eq(shown)
    expect(json[:ready]).to be_empty
    expect(json[:preparing].map { |o| o[:id] }).not_to include(tomorrow[:id], stale[:id])

    api_post "/api/v1/kitchen/orders/#{now[:id]}/bump", {}, headers: device_headers(kds)
    get "/api/v1/kitchen/ready", headers: device_headers(screen)
    expect(json[:data].map { |o| o[:id] }).to eq([ now[:id] ])
  end

  # Since paying stopped marking lines served (QA F2), an order paid at once stays paid while the kitchen cooks it: the
  # customers' screens follow its lines and ready_at, as the kitchen display does, not its status.
  describe "an order paid at once" do
    before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

    def paid_at_once!
      o = placed([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ], order_type: "takeaway")
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
      expect(json[:order]).to include(status: "paid"), response.body
      o
    end

    def screens
      get "/api/v1/kitchen/queue", headers: device_headers(screen)
      queue = json
      get "/api/v1/kitchen/ready", headers: device_headers(screen)
      { preparing: queue[:preparing].map { |r| r[:id] }, ready: queue[:ready].map { |r| r[:id] }, token: json[:data].map { |r| r[:id] } }
    end

    it "is preparing while a line cooks, ready once each station has bumped, and stays paid" do
      o = paid_at_once!
      expect(screens).to eq(preparing: [ o[:id] ], ready: [], token: [])
      api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", { station_id: m[:grill].id }, headers: device_headers(kds)
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(status: "paid", ready_at: nil)
      expect(screens).to eq(preparing: [ o[:id] ], ready: [], token: [])
      api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", { station_id: m[:drinks].id }, headers: device_headers(kds)
      expect(json).to include(status: "paid", ready_at: be_present)
      expect(statuses(o[:id])).to eq([ [ "Chai", "ready" ], [ "Zinger Burger", "ready" ] ])
      expect(screens).to eq(preparing: [], ready: [ o[:id] ], token: [ o[:id] ])

      travel 16.minutes do # collected: nothing at the till records the hand-over of a paid takeaway
        expect(screens).to eq(preparing: [], ready: [], token: [])
      end
    end

    it "shows a line added to a ready order as preparing until it is bumped, and the order stays ready" do
      o = placed([ { product_id: m[:burger].id } ])
      api_post "/api/v1/kitchen/orders/#{o[:id]}/bump", {}, headers: device_headers(kds)
      expect(screens[:ready]).to eq([ o[:id] ])
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: o[:items].first[:id], quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(screens).to eq(preparing: [ o[:id] ], ready: [], token: [])
      chai = within(biz) { Order.find(o[:id]).items.find { |i| i.name_snapshot == "Chai" } }
      api_post "/api/v1/kitchen/items/#{chai.id}/bump", {}, headers: device_headers(kds)
      expect(response).to have_http_status(:ok), response.body
      expect(json[:status]).to eq("ready")
      expect(statuses(o[:id])).to eq([ [ "Chai", "ready" ], [ "Zinger Burger", "ready" ] ])
      expect(screens).to eq(preparing: [], ready: [ o[:id] ], token: [ o[:id] ])
    end
  end
end

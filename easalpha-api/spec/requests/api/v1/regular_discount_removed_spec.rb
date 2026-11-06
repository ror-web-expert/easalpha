require "rails_helper"

# A regular discount a manager took off an order came back on the next save that carried lines, which the till makes
# when Pay opens and again when Pay is pressed (leftovers of 7 Nov 2026, L1 item 6). The removal is now kept on the
# order, so no save puts it back, online or from the sync queue; the customer's other orders still get it.
RSpec.describe "A regular discount taken off stays off", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T3") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }
  let(:sana) { within(biz) { Customer.create!(name: "Sana Farooq", phone: "+923001112233", last_order_at: 1.day.ago) } }
  let(:ali) { within(biz) { Customer.create!(name: "Ali Raza", phone: "+923004445566", last_order_at: 2.days.ago) } }

  before do
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: auth_headers(owner)
  end

  def kinds(o) = o[:discounts].map { |d| d[:kind] }

  def take_off_regular!(o)
    regular = o[:discounts].find { |d| d[:kind] == "regular" }
    delete "/api/v1/orders/#{o[:id]}/discounts/#{regular[:id]}", headers: auth_headers(owner)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:regular_discount_removed_at]).to be_present
    json
  end

  def lines_of(o) = o[:items].map { |i| { id: i[:id], product_id: i[:product_id], quantity: i[:quantity].to_d } }

  it "leaves it off through saves with lines, a change of customer and the payment" do
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: sana.id, lines: [ { product_id: m[:burger].id, quantity: 2 } ] }, headers: pos
    expect(kinds(json)).to eq([ "regular" ])
    o = take_off_regular!(json)
    full = o[:total_minor]

    2.times do # Pay opens, Pay is pressed: the till saves every line each time
      api_patch "/api/v1/orders/#{o[:id]}", { customer_id: sana.id, order_type: "takeaway", lines: lines_of(o) }, headers: pos
      expect(response).to have_http_status(:ok), response.body
      expect(kinds(json)).to eq([])
      expect(json[:total_minor]).to eq(full)
    end
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: ali.id, lines: lines_of(o) }, headers: pos # another regular customer
    expect(kinds(json)).to eq([])

    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: full } ] }, headers: pos
    expect(response).to have_http_status(:created), response.body
    expect(json[:order]).to include(payment_status: "paid", total_minor: full)

    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: ali.id, lines: [ { product_id: m[:burger].id, quantity: 2 } ] }, headers: pos
    expect(kinds(json)).to eq([ "regular" ]) # the customer's next order still gets it
  end

  it "leaves it off when the till's queued update of the order is replayed" do
    id = SecureRandom.uuid
    api_post "/api/v1/sync/push", { records: [ { type: "order", id: id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", customer_id: sana.id,
                                                                                                       lines: [ { product_id: m[:burger].id, quantity: 2 } ] } } ] }, headers: pos
    expect(json[:results].first[:status]).to eq("accepted"), json.inspect
    get "/api/v1/orders/#{id}", headers: pos
    expect(kinds(json)).to eq([ "regular" ])
    o = take_off_regular!(json)

    update = { type: "order_update", id: id, membership_id: cashier.id,
               payload: { order_type: "takeaway", customer_id: sana.id, client_seq: 1_731_000_000_001, lines: lines_of(o) + [ { id: SecureRandom.uuid, product_id: m[:chai].id, quantity: 1 } ] } }
    api_post "/api/v1/sync/push", { records: [ update ] }, headers: pos
    expect(json[:results].first[:status]).to eq("accepted"), json.inspect
    get "/api/v1/orders/#{id}", headers: pos
    expect(kinds(json)).to eq([])
    expect(json[:items].map { |i| i[:name] }.sort).to eq([ "Chai", "Zinger Burger" ])
  end
end

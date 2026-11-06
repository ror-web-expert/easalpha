require "rails_helper"

# Review of 6 Nov 2026, R1: a price-embedded scale label charges exactly its printed price. The till sends the price on
# the line (label_price_minor) with the weight it worked out; the server keeps the price, works the weight out itself in
# the same arithmetic (src/lib/pricing.ts labelWeight) and needs no price override for it. Before, Rs 50 and Rs 100
# labels of Rs 1,200/kg mithai came to 0.042 kg = Rs 50.40 and 0.083 kg = Rs 99.60.
RSpec.describe "Scale labels: the line charges the label price", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz, with_tax: false) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T5") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") } # no prices.override
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }
  let!(:mithai) do
    within(biz) do
      p = Product.create!(category: m[:burger].category, name: "Gulab jamun", base_price_minor: 120_000, sold_by_weight: true, weight_unit: "kg")
      p.product_prices.create!(order_type: "delivery", price_minor: 130_000)
      p
    end
  end

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def label_line(price, quantity:, **extra) = { product_id: mithai.id, quantity: quantity, label_price_minor: price, **extra }
  def items = json[:items].sort_by { |i| i[:sort_order] }

  it "works the weight out as the till does: 3 decimals, halves up, nothing below a gram" do
    expect(Orders::Builder.label_weight(5_000, 120_000)).to eq(BigDecimal("0.042"))
    expect(Orders::Builder.label_weight(10_000, 120_000)).to eq(BigDecimal("0.083"))
    expect(Orders::Builder.label_weight(45_000, 120_000)).to eq(BigDecimal("0.375"))
    expect(Orders::Builder.label_weight(6, 12_000)).to eq(BigDecimal("0.001")) # exactly half a gram rounds up
    expect(Orders::Builder.label_weight(5, 12_000)).to eq(0)
    expect(Orders::Builder.label_weight(5_000, 0)).to eq(0)
  end

  it "charges Rs 50 and Rs 100 labels exactly for a cashier without prices.override, with the weight on the line and the receipt" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042), label_line(10_000, quantity: 0.083) ] }, headers: pos
    expect(response).to have_http_status(:created), response.body
    expect(items.map { |i| [ i[:quantity], i[:unit], i[:unit_price_minor], i[:label_price_minor], i[:line_subtotal_minor], i[:price_overridden] ] })
      .to eq([ [ "0.042", "kg", 120_000, 5_000, 5_000, false ], [ "0.083", "kg", 120_000, 10_000, 10_000, false ] ])
    expect(json).to include(subtotal_minor: 15_000, total_minor: 15_000)
    id = json[:id]

    get "/api/v1/orders/#{id}/receipt", headers: pos
    expect(json[:lines].map { |l| l.slice(:quantity, :unit, :label_price_minor, :line_subtotal_minor) })
      .to eq([ { quantity: "0.042", unit: "kg", label_price_minor: 5_000, line_subtotal_minor: 5_000 }, { quantity: "0.083", unit: "kg", label_price_minor: 10_000, line_subtotal_minor: 10_000 } ])
    expect(json[:totals][:total_minor]).to eq(15_000)

    api_post "/api/v1/orders/#{id}/payments", { payments: [ { method_code: "cash", amount_minor: 15_000 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(json[:order]).to include(payment_status: "paid", total_minor: 15_000)
  end

  it "takes the weight from the label, not the till, so a label price never hides a discount" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 5) ] }, headers: pos
    expect(response).to have_http_status(:created), response.body
    expect(items.first).to include(quantity: "0.042", line_subtotal_minor: 5_000)
  end

  it "taxes the label price like any line" do
    within(biz) { mithai.update!(tax_rate: TaxRate.create!(name: "GST 16%", rate: 16, inclusive: false)) }
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    expect(json).to include(subtotal_minor: 5_000, tax_minor: 800, total_minor: 5_800)
  end

  it "ignores a label on a product not sold by weight, refuses one that buys less than a gram" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id, quantity: 1, label_price_minor: 100 } ] }, headers: pos
    expect(response).to have_http_status(:created), response.body
    expect(items.first).to include(label_price_minor: nil, line_subtotal_minor: 8_000)

    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5, quantity: 0.001) ] }, headers: pos
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:code]).to eq("label.no_weight")
  end

  it "keeps the label through saves and a change of order type; a null label or a price override prices by weight again" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    id = json[:id]
    line = items.first[:id]
    api_patch "/api/v1/orders/#{id}", { notes: "box it", lines: [ label_line(5_000, quantity: 0.042, id: line) ] }, headers: pos
    expect(items.first).to include(quantity: "0.042", line_subtotal_minor: 5_000)
    api_patch "/api/v1/orders/#{id}", { lines: [ { id: line, product_id: mithai.id, quantity: 0.042 } ] }, headers: pos # without the key: unchanged
    expect(items.first).to include(label_price_minor: 5_000, line_subtotal_minor: 5_000)

    # Delivery prices it at Rs 1,300/kg: the label still costs Rs 50 and stands for 0.038 kg.
    api_patch "/api/v1/orders/#{id}", { order_type: "delivery" }, headers: pos
    expect(response).to have_http_status(:ok), response.body
    expect(items.first).to include(unit_price_minor: 130_000, quantity: "0.038", label_price_minor: 5_000, line_subtotal_minor: 5_000)

    # The cashier changed the weight by hand: the till drops the label and the line is priced by weight.
    api_patch "/api/v1/orders/#{id}", { lines: [ label_line(nil, quantity: 1.042, id: line) ] }, headers: pos
    expect(items.first).to include(quantity: "1.042", label_price_minor: nil, line_subtotal_minor: 135_460)

    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    other = json[:id]
    api_patch "/api/v1/orders/#{other}", { lines: [ label_line(5_000, quantity: 0.042, id: items.first[:id], price_override_minor: 100_000) ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(items.first).to include(price_overridden: true, label_price_minor: nil, line_subtotal_minor: 4_200)
  end

  it "keeps a label already on an order when the product stops being sold by weight, and takes no new one" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    id = json[:id]
    line = items.first[:id]
    within(biz) { mithai.update!(sold_by_weight: false) }
    api_patch "/api/v1/orders/#{id}", { notes: "later", lines: [ label_line(5_000, quantity: 0.042, id: line) ] }, headers: pos
    expect(items.first).to include(label_price_minor: 5_000, line_subtotal_minor: 5_000)
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    expect(items.first).to include(label_price_minor: nil, line_subtotal_minor: 5_040)
  end

  it "replays an offline label sale paid in cash as paid in full" do
    id = SecureRandom.uuid
    api_post "/api/v1/sync/push", { records: [ { type: "order", id: id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed",
      lines: [ label_line(5_000, quantity: 0.042), label_line(10_000, quantity: 0.083) ], payments: [ { id: SecureRandom.uuid, method_code: "cash", amount_minor: 15_000 } ] } } ] }, headers: pos
    expect(json[:results].first[:status]).to eq("accepted"), response.body
    within(biz) do
      order = Order.find(id)
      expect([ order.total_minor, order.paid_minor, order.payment_status ]).to eq([ 15_000, 15_000, "paid" ])
      expect(order.items.order(:sort_order).map { |i| [ i.quantity, i.line_subtotal_minor ] }).to eq([ [ BigDecimal("0.042"), 5_000 ], [ BigDecimal("0.083"), 10_000 ] ])
    end
  end

  it "never takes a label from a QR guest, and keeps a cashier's label when the guest orders again" do
    table = within(biz) { DiningTable.create!(branch: branch, code: "T9", seats: 4) }
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: false, guest_name: false } }, headers: headers
    api_post "/api/v1/qr/#{table.qr_token}/orders", { lines: [ label_line(100, quantity: 1) ] }
    expect(response).to have_http_status(:created), response.body
    id = json[:id]
    guest_line = within(biz) { Order.find(id).items.first }
    expect([ guest_line.label_price_minor, guest_line.line_subtotal_minor ]).to eq([ nil, 120_000 ])

    get "/api/v1/orders/#{id}", headers: pos
    lines = items.map { |i| { id: i[:id], product_id: i[:product_id], quantity: i[:quantity] } }
    api_patch "/api/v1/orders/#{id}", { lines: lines + [ label_line(5_000, quantity: 0.042) ] }, headers: pos
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/qr/#{table.qr_token}/orders", { lines: [ { product_id: m[:chai].id, quantity: 1 } ] }
    expect(response).to have_http_status(:created), response.body
    within(biz) do
      label = Order.find(id).items.find(&:label_price_minor)
      expect([ label.quantity, label.line_subtotal_minor ]).to eq([ BigDecimal("0.042"), 5_000 ])
    end
  end
end

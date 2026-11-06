require "rails_helper"

# A queued order update the till sends twice (its answer was lost) is applied once: the till's number
# for it is recorded with the update, so the repeat is a duplicate and the kitchen gets one ticket (review of
# 6 Nov 2026, R17).
RSpec.describe "Sync push: an order update applied once", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T3") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }
  let(:order_id) { SecureRandom.uuid }

  def push(records, headers: pos)
    api_post("/api/v1/sync/push", { records: records }, headers: headers)
    expect(response).to have_http_status(:ok), response.body
    json[:results]
  end

  # The order as the server took it: one chai, placed (a "new" ticket).
  def placed_order!
    results = push([ { type: "order", id: order_id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ])
    expect(results.first[:status]).to eq("accepted"), results.inspect
    within(biz) { Order.find(order_id).items.first.id }
  end

  # What the till queues after an edit offline: every line, the new ones under the till's own ids, and its number.
  def update_record(chai_id, seq:, extra_line: { id: SecureRandom.uuid, product_id: m[:burger].id, quantity: 1 }, **payload)
    { type: "order_update", id: order_id, membership_id: cashier.id,
      payload: { order_type: "takeaway", lines: [ { id: chai_id, product_id: m[:chai].id, quantity: 1 }, extra_line ].compact, client_seq: seq }.merge(payload) }
  end

  def tickets = within(biz) { KitchenTicket.where(order_id: order_id).order(:created_at).pluck(:kind) }
  def live_lines = within(biz) { Order.find(order_id).items.reject(&:cancelled?).map(&:name_snapshot).sort }

  it "answers a re-sent batch as a duplicate: no second kitchen ticket, no doubled or cancelled lines" do
    chai_id = placed_order!
    batch = [ update_record(chai_id, seq: 1_730_900_000_001) ]
    expect(push(batch).first[:status]).to eq("accepted")
    expect(tickets).to eq(%w[new changed])
    expect(live_lines).to eq([ "Chai", "Zinger Burger" ])

    # The answer was lost (timeout, the uplink dropped): the till sends the same batch again.
    expect(push(batch).first[:status]).to eq("duplicate")
    expect(tickets).to eq(%w[new changed])
    expect(live_lines).to eq([ "Chai", "Zinger Burger" ])
    expect(within(biz) { OrderItem.where(order_id: order_id, status: "cancelled").count }).to eq(0)

    # A later edit has a new number and is applied; another till's update with the same number is its own.
    burger_id = within(biz) { Order.find(order_id).items.find { |i| i.name_snapshot == "Zinger Burger" }.id }
    later = update_record(chai_id, seq: 1_730_900_000_002, extra_line: { id: burger_id, product_id: m[:burger].id, quantity: 2 })
    expect(push([ later ]).first[:status]).to eq("accepted")
    expect(tickets).to eq(%w[new changed changed])
    till2 = within(biz) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current, code: "T4") }
    other = update_record(chai_id, seq: 1_730_900_000_002, extra_line: { id: burger_id, product_id: m[:burger].id, quantity: 3 })
    expect(push([ other ], headers: auth_headers(cashier, app: "pos", device: till2)).first[:status]).to eq("accepted")
    expect(within(biz) { Order.find(order_id).items.find { |i| i.name_snapshot == "Zinger Burger" }.quantity }).to eq(3)
  end

  it "keeps nothing of a refused update, so Try again with a manager PIN applies it once" do
    chai_id = placed_order!
    record = update_record(chai_id, seq: 1_730_900_000_010, extra_line: { id: SecureRandom.uuid, product_id: m[:burger].id, quantity: 1, price_override_minor: 30_000 })
    first = push([ record ]).first
    expect(first).to include(status: "rejected", code: "approval.required")
    expect(tickets).to eq(%w[new])
    expect(live_lines).to eq([ "Chai" ])
    expect(push([ record.merge(approver_pin: "9999") ]).first[:status]).to eq("accepted")
    expect(push([ record ]).first[:status]).to eq("duplicate")
    expect(tickets).to eq(%w[new changed])
    expect(live_lines).to eq([ "Chai", "Zinger Burger" ])
  end
end

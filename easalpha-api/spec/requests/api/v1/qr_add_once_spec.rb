require "rails_helper"

# A QR guest's retry on the table's running order adds nothing twice: each submit's client id is
# recorded with the lines it added, and a retry answers the order they went to (review of 6 Nov 2026, R18).
RSpec.describe "QR ordering: an add to the table's order applied once", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  let(:table) { within(biz) { DiningTable.create!(branch: branch, code: "T7", seats: 4) } }

  def submit(client_id, product = m[:chai], quantity: 1)
    api_post "/api/v1/qr/#{table.qr_token}/orders", { client_id: client_id, lines: [ { product_id: product.id, quantity: quantity } ] }
    expect(response).to have_http_status(:created), response.body
    json
  end

  def lines(order_id) = within(biz) { Order.find(order_id).items.reject(&:cancelled?).map { |i| [ i.name_snapshot, i.quantity.to_i ] }.sort }

  it "adds the lines of one submit once, and answers a late retry with the order they went to" do
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: false, guest_name: false } }, headers: headers
    first = submit(SecureRandom.uuid)
    more = SecureRandom.uuid
    expect(submit(more, m[:burger], quantity: 2)[:id]).to eq(first[:id])
    expect(lines(first[:id])).to eq([ [ "Chai", 1 ], [ "Zinger Burger", 2 ] ])
    tickets = within(biz) { KitchenTicket.where(order_id: first[:id]).count }

    expect(submit(more, m[:burger], quantity: 2)[:id]).to eq(first[:id]) # the answer was lost; the guest taps again
    expect(lines(first[:id])).to eq([ [ "Chai", 1 ], [ "Zinger Burger", 2 ] ])
    expect(within(biz) { KitchenTicket.where(order_id: first[:id]).count }).to eq(tickets)

    # Paid and completed in the meantime, the table free again: the retry still names that order, no new one.
    o = within(biz) { Order.find(first[:id]) }
    api_post "/api/v1/orders/#{o.id}/payments", { payments: [ { method_code: "cash", amount_minor: o.total_minor, tendered_minor: o.total_minor } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    expect(submit(more, m[:burger], quantity: 2)[:id]).to eq(first[:id])
    expect(within(biz) { Order.where(source: "qr").count }).to eq(1)

    # A new submit is a new order on the free table, as before.
    expect(submit(SecureRandom.uuid)[:id]).not_to eq(first[:id])
  end

  it "holds a retried add for the cashier once when orders wait for acceptance" do
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: false, guest_name: false } }, headers: headers
    first = submit(SecureRandom.uuid)
    api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: true, guest_name: false } }, headers: headers
    more = SecureRandom.uuid
    submit(more, m[:burger])
    submit(more, m[:burger])
    expect(lines(first[:id])).to eq([ [ "Chai", 1 ], [ "Zinger Burger", 1 ] ])
    expect(within(biz) { Notification.where(kind: "qr_order").count }).to eq(1)
  end
end

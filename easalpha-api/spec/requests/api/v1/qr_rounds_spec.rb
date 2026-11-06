require "rails_helper"

# Final round of 6 Nov 2026. F4: a guest's second round, while the first still waits for the cashier or on a table a
# waiter opened at the till, goes onto that table's open order through the same pending and accept flow (it used to
# answer 409 "Table T4 has an open order"). F5: a submit's client id holds under a retry, for first orders and rounds,
# with or without the cashier accepting.
RSpec.describe "QR ordering: rounds on a table's open order", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:table) { within(biz) { DiningTable.create!(branch: branch, code: "T4", seats: 4) } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def qr!(cashier_accept:) = api_patch("/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: cashier_accept, guest_name: false } }, headers: headers)

  def submit(product, quantity: 1, client_id: SecureRandom.uuid)
    api_post "/api/v1/qr/#{table.qr_token}/orders", { client_id: client_id, lines: [ { product_id: product.id, quantity: quantity } ] }
    expect(response).to have_http_status(:created), response.body
    json
  end

  def lines(order_id) = within(biz) { Order.find(order_id).items.reject(&:cancelled?).map { |i| [ i.name_snapshot, i.quantity.to_i, i.status ] }.sort }
  def tickets(order_id) = within(biz) { KitchenTicket.where(order_id: order_id).order(:created_at).pluck(:kind) }

  it "adds a second round to a first one still waiting for the cashier, and sends both on accept" do
    qr!(cashier_accept: true)
    first = submit(m[:burger])
    expect(first[:qr_status]).to eq("pending")
    second = submit(m[:chai], quantity: 2)
    expect(second[:id]).to eq(first[:id])
    expect(second[:qr_status]).to eq("pending")
    expect(lines(first[:id])).to eq([ [ "Chai", 2, "pending" ], [ "Zinger Burger", 1, "pending" ] ])

    api_post "/api/v1/qr_orders/#{first[:id]}/accept", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("placed")
    expect(lines(first[:id]).map(&:last).uniq).to eq([ "sent" ])
  end

  it "takes a guest's round on a table a waiter opened at the till: it waits for the cashier, who sees what is new" do
    qr!(cashier_accept: true)
    api_post "/api/v1/orders", { order_type: "dine_in", table_id: table.id, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    till = json
    round = submit(m[:chai], quantity: 2)
    expect(round[:id]).to eq(till[:id])
    expect(round[:qr_status]).to eq("pending")

    get "/api/v1/qr_orders?status=pending", headers: headers
    row = json[:data].find { |r| r[:id] == till[:id] }
    expect(row).to be_present
    expect(row[:waiting_items]).to eq([ { name: "Chai", quantity: "2" } ])

    api_post "/api/v1/qr_orders/#{till[:id]}/accept", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(lines(till[:id])).to eq([ [ "Chai", 2, "sent" ], [ "Zinger Burger", 1, "sent" ] ])
    expect(tickets(till[:id])).to include("changed")
    expect(within(biz) { Order.find(till[:id]).total_minor }).to eq(((45_000 + 2 * 8_000) * 1.16).round)
  end

  it "sends a round on a running till order straight to the kitchen when orders are not accepted first" do
    qr!(cashier_accept: false)
    api_post "/api/v1/orders", { order_type: "dine_in", table_id: table.id, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    till = json
    round = submit(m[:chai])
    expect(round[:id]).to eq(till[:id])
    expect(lines(till[:id])).to eq([ [ "Chai", 1, "sent" ], [ "Zinger Burger", 1, "sent" ] ])
    expect(tickets(till[:id]).last).to eq("changed")
  end

  it "keeps a waiter's unsent order from being sent by a guest, and a rejected round takes off only its own lines" do
    qr!(cashier_accept: false)
    api_post "/api/v1/orders", { order_type: "dine_in", table_id: table.id, lines: [ { product_id: m[:burger].id } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    draft = json
    expect(draft[:status]).to eq("draft")
    round = submit(m[:chai], quantity: 3)
    expect(round[:id]).to eq(draft[:id])
    expect(round[:qr_status]).to eq("pending") # waits although the branch sends guest orders straight in
    expect(tickets(draft[:id])).to be_empty

    api_post "/api/v1/qr_orders/#{draft[:id]}/reject", { reason: "Out of chai" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("draft") # the waiter's order stands
    expect(within(biz) { Order.find(draft[:id]).qr_status }).to be_nil
    expect(lines(draft[:id])).to eq([ [ "Zinger Burger", 1, "pending" ] ])
    expect(json[:total_minor]).to eq((45_000 * 1.16).round)
  end

  it "rejects a round on a running guest order without voiding what the kitchen already has" do
    qr!(cashier_accept: true)
    first = submit(m[:burger])
    api_post "/api/v1/qr_orders/#{first[:id]}/accept", {}, headers: headers
    submit(m[:chai], quantity: 2)
    api_post "/api/v1/qr_orders/#{first[:id]}/reject", { reason: "Kitchen closing" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("placed")
    expect(within(biz) { Order.find(first[:id]).qr_status }).to eq("accepted")
    expect(lines(first[:id])).to eq([ [ "Zinger Burger", 1, "sent" ] ])

    # A guest order the cashier turns away whole is voided, as before.
    api_post "/api/v1/orders/#{first[:id]}/void", { reason: "Guests left" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    lone = submit(m[:chai])
    expect(lone[:id]).not_to eq(first[:id])
    api_post "/api/v1/qr_orders/#{lone[:id]}/reject", { reason: "Closed" }, headers: headers
    expect(json[:status]).to eq("voided")
    expect(within(biz) { Order.find(lone[:id]).qr_status }).to eq("rejected")
  end

  it "answers a retry of an accepted submit with its order, for a first order and for a round" do
    qr!(cashier_accept: true)
    key = SecureRandom.uuid
    first = submit(m[:burger], client_id: key)
    api_post "/api/v1/qr_orders/#{first[:id]}/accept", {}, headers: headers
    again = submit(m[:burger], client_id: key) # the answer was lost; the guest taps again
    expect(again[:id]).to eq(first[:id])
    expect(lines(first[:id])).to eq([ [ "Zinger Burger", 1, "sent" ] ])

    more = SecureRandom.uuid
    submit(m[:chai], client_id: more)
    api_post "/api/v1/qr_orders/#{first[:id]}/accept", {}, headers: headers
    expect(submit(m[:chai], client_id: more)[:id]).to eq(first[:id])
    expect(lines(first[:id])).to eq([ [ "Chai", 1, "sent" ], [ "Zinger Burger", 1, "sent" ] ])
    expect(within(biz) { Order.where(source: "qr").count }).to eq(1)
  end

  # Submits sent at the same moment need committed rows in two connections, so this group runs outside the test
  # transaction and removes what it made afterwards.
  describe "the same submit twice at once" do
    self.use_transactional_tests = false

    let!(:owner) { signup_business(name: "QR Race Cafe") }

    after do
      conn = ActiveRecord::Base.connection
      ids = Business.where(name: "QR Race Cafe").pluck(:id)
      user_ids = Membership.unscoped.where(business_id: ids).pluck(:user_id)
      tables = conn.tables.select { |t| conn.column_exists?(t, :business_id) } - %w[audit_logs]
      6.times do
        tables = tables.reject do |t|
          conn.execute("DELETE FROM #{conn.quote_table_name(t)} WHERE business_id IN (#{ids.map { |i| conn.quote(i) }.join(',')})")
          true
        rescue ActiveRecord::StatementInvalid
          false
        end
        break if tables.empty?
      end
      Business.where(id: ids).delete_all
      User.where(id: user_ids).delete_all
    end

    def wait_for_a_lock_wait
      50.times do
        return if ActiveRecord::Base.connection.select_value("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'").to_i.positive?
        sleep 0.1
      end
    end

    # Two submits with one client id: the first is held open after placing, the second sent meanwhile.
    def race(key, product)
      t = within(biz) { DiningTable.find(table.id) }
      taken = Queue.new
      release = Queue.new
      place = lambda do |hold|
        ActiveRecord::Base.connection_pool.with_connection do
          Tenancy::Context.with(biz, branch: t.branch) do
            ActiveRecord::Base.transaction do
              order = Qr::Ordering.place!(DiningTable.find(t.id), lines: [ { product_id: product.id, quantity: 1 } ], client_id: key)
              if hold
                taken << true
                release.pop
              end
              order.id
            end
          end
        end
      rescue StandardError => e
        e.class.name
      end
      first = Thread.new { place.call(true) }
      taken.pop
      second = Thread.new { place.call(false) }
      wait_for_a_lock_wait
      release << true
      [ first.value, second.value ]
    end

    it "makes one order of a first order and adds a round once" do
      qr!(cashier_accept: true)
      ids = race(SecureRandom.uuid, m[:burger])
      expect(ids.uniq.size).to eq(1)
      expect(within(biz) { Order.where(source: "qr").count }).to eq(1)

      ids = race(SecureRandom.uuid, m[:chai])
      expect(ids.uniq).to eq([ within(biz) { Order.find_by!(source: "qr").id } ])
      expect(lines(ids.first)).to eq([ [ "Chai", 1, "pending" ], [ "Zinger Burger", 1, "pending" ] ])
    end
  end
end

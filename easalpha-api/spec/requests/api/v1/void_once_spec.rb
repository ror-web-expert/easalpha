require "rails_helper"

# A void gives back what the order consumed: the coupon use, the loyalty points, the voucher. void! read the order
# without a lock, so two voids at once (two tills, a request sent again, the sync queue) both went through and gave
# the coupon use back twice and wrote two voids and two kitchen cancellations (leftovers of 7 Nov 2026, L1 item 7). The
# order row is locked now: the second void waits, finds the order voided and is refused.
RSpec.describe "Voiding an order once", type: :request do
  def setup_order!(biz, owner)
    m = build_menu!(biz)
    within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? }
    h = auth_headers(owner)
    api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true }, headers: h
    zara = within(biz) { Customer.create!(name: "Zara", phone: "+923005556666", loyalty_points: 500) }
    promo = within(biz) { Promotion.create!(name: "Ten off", kind: "coupon", value: 10, coupon_code: "TENOFF", valid_from: 1.hour.ago, valid_to: 7.days.from_now, units_sold: 5) }
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: zara.id, lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: h
    order = json
    api_post "/api/v1/orders/#{order[:id]}/discounts", { kind: "promotion", coupon_code: "TENOFF" }, headers: h
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/orders/#{order[:id]}/redeem_points", { points: 100 }, headers: h
    expect(response).to have_http_status(:ok), response.body
    expect([ promo.reload.units_sold, zara.reload.loyalty_points ]).to eq([ 6, 400 ])
    [ order[:id], promo, zara ]
  end

  describe "one after the other" do
    let!(:owner) { signup_business }
    let(:biz) { owner.business }

    it "refuses a second void of a voided order and gives nothing back again" do
      id, promo, zara = setup_order!(biz, owner)
      api_post "/api/v1/orders/#{id}/void", { reason: "Guest left" }, headers: auth_headers(owner)
      expect(response).to have_http_status(:ok), response.body
      expect([ promo.reload.units_sold, zara.reload.loyalty_points ]).to eq([ 5, 500 ])
      api_post "/api/v1/orders/#{id}/void", { reason: "Guest left" }, headers: auth_headers(owner)
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("order.status")
      expect { within(biz) { Orders::Transitions.void!(Order.find(id), reason: "again", actor: owner, approver: nil) } }.to raise_error(Api::Errors::Conflict)
      expect([ promo.reload.units_sold, zara.reload.loyalty_points ]).to eq([ 5, 500 ])
      expect(within(biz) { Void.where(order_id: id).count }).to eq(1)
    end
  end

  # Two voids at the same moment need committed rows in two connections, so this group runs outside the test
  # transaction and removes what it made afterwards.
  describe "at the same moment" do
    self.use_transactional_tests = false

    let!(:owner) { signup_business(name: "Void Race Cafe") }
    let(:biz) { owner.business }

    after do
      conn = ActiveRecord::Base.connection
      ids = Business.where(name: "Void Race Cafe").pluck(:id)
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

    it "voids once: the second waits for the first, finds the order voided and is refused" do
      id, promo, zara = setup_order!(biz, owner)
      branch = within(biz) { Branch.first }
      taken = Queue.new
      release = Queue.new
      void = lambda do |hold|
        ActiveRecord::Base.connection_pool.with_connection do
          Tenancy::Context.with(biz, branch: branch) do
            ActiveRecord::Base.transaction do
              Orders::Transitions.void!(Order.find(id), reason: "Guest left", actor: Membership.find(owner.id), approver: nil)
              if hold
                taken << true
                release.pop
              end
              :voided
            end
          end
        end
      rescue Api::Errors::ApiError => e
        e.code
      end
      first = Thread.new { void.call(true) }
      taken.pop
      second = Thread.new { void.call(false) }
      wait_for_a_lock_wait
      release << true
      expect([ first.value, second.value ]).to eq([ :voided, "order.status" ])
      expect([ promo.reload.units_sold, zara.reload.loyalty_points ]).to eq([ 5, 500 ])
      within(biz) do
        expect(Void.where(order_id: id).count).to eq(1)
        expect(KitchenTicket.where(order_id: id, kind: "cancelled").count).to eq(1)
      end
    end
  end
end

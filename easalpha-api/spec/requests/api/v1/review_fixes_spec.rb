require "rails_helper"

# 29 Oct 2026 review: the holes that let money or data move without the right to, each closed and kept closed here.
RSpec.describe "Review fixes: public prices, webhooks, approvals, locks", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T2") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  # Chai at Rs 80 plus 16% tax, sold and paid in cash from the till's offline queue.
  def paid_order!
    id = SecureRandom.uuid
    api_post "/api/v1/sync/push", { records: [ { type: "order", id: id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed",
      lines: [ { product_id: m[:chai].id, quantity: 1 } ], payments: [ { id: SecureRandom.uuid, method_code: "cash", amount_minor: 9_280 } ] } } ] }, headers: device_headers(device)
    expect(json[:results].first[:status]).to eq("accepted"), response.body
    id
  end

  describe "public ordering" do
    before { within(biz) { WebsiteConfig.for_business!.update!(published: true, slug: "karachi-grill") } }

    it "prices a storefront order from the catalogue, whatever the guest sends" do
      guest = { name: "Guest", phone: "03001234567" }
      api_post "/api/v1/public/storefront/karachi-grill/orders", { order_type: "takeaway", customer: guest,
        lines: [ { open_item: { name: "Free biryani", price_minor: -50_000 }, quantity: 1 } ] }
      expect(response).to have_http_status(:not_found) # an open item has no product; nothing is created
      expect(within(biz) { Order.count }).to eq(0)

      api_post "/api/v1/public/storefront/karachi-grill/orders", { order_type: "takeaway", customer: guest,
        lines: [ { product_id: m[:burger].id, quantity: 1, price_override_minor: 1 } ] }
      expect(response).to have_http_status(:created), response.body
      within(biz) do
        item = Order.find(json[:id]).items.first
        expect(item.unit_price_minor).to eq(45_000)
        expect(item.price_overridden).to be false
      end
    end

    it "takes a QR deal only with the choices the deal offers and ignores a guest's price" do
      table = within(biz) { DiningTable.create!(branch: branch, code: "T7", seats: 4) }
      api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: true, guest_name: true } }, headers: headers
      api_post "/api/v1/qr/#{table.qr_token}/orders", { guest_name: "Ayesha", lines: [ { deal_id: m[:deal].id, quantity: 1, deal_choices: [ { product_id: m[:burger].id, quantity: 10 } ] } ] }
      expect(response).to have_http_status(:unprocessable_content), response.body
      expect(json[:error][:code]).to eq("deal.choice_invalid")

      api_post "/api/v1/qr/#{table.qr_token}/orders", { guest_name: "Ayesha", lines: [ { product_id: m[:burger].id, quantity: 1, price_override_minor: 5 } ] }
      expect(response).to have_http_status(:created), response.body
      expect(within(biz) { Order.find(json[:id]).items.first.unit_price_minor }).to eq(45_000)
    end
  end

  describe "webhooks" do
    it "refuses Paddle events until a secret is configured, then only fresh signed ones" do
      old = ENV.delete("PADDLE_WEBHOOK_SECRET")
      body = { event_type: "subscription.activated", data: { id: "sub_x", custom_data: { business_id: biz.id, plan_code: "pro" } } }
      api_post "/api/v1/webhooks/paddle", body
      expect(response).to have_http_status(:service_unavailable)
      expect(biz.reload.status).to eq("trial")

      ENV["PADDLE_WEBHOOK_SECRET"] = "s3cret"
      api_post "/api/v1/webhooks/paddle", body
      expect(response).to have_http_status(:unauthorized)
      raw = body.to_json
      sign = ->(ts) { { "Content-Type" => "application/json", "Paddle-Signature" => "ts=#{ts};h1=#{OpenSSL::HMAC.hexdigest('SHA256', 's3cret', "#{ts}:#{raw}")}" } }
      post "/api/v1/webhooks/paddle", params: raw, headers: sign.call(10.minutes.ago.to_i)
      expect(response).to have_http_status(:unauthorized) # a replay
      post "/api/v1/webhooks/paddle", params: raw, headers: sign.call(Time.current.to_i)
      expect(response).to have_http_status(:ok)
      expect(biz.reload.status).to eq("active")
    ensure
      old ? ENV["PADDLE_WEBHOOK_SECRET"] = old : ENV.delete("PADDLE_WEBHOOK_SECRET")
    end

    it "refuses an unsigned WhatsApp Cloud webhook" do
      old = ENV.delete("WHATSAPP_APP_SECRET")
      api_post "/api/v1/webhooks/whatsapp", { entry: [] }
      expect(response).to have_http_status(:service_unavailable)
    ensure
      ENV["WHATSAPP_APP_SECRET"] = old if old
    end
  end

  describe "offline sync" do
    it "takes a refund from the till only with a real manager approval" do
      order_id = paid_order!
      refund = { type: "refund", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: order_id, amount_minor: 9_280, method_code: "cash", reason: "cold", approved_by_membership_id: cashier.id } }
      api_post "/api/v1/sync/push", { records: [ refund ] }, headers: device_headers(device)
      expect(json[:results].first).to include(status: "rejected", code: "approval.required")
      expect(within(biz) { Refund.count }).to eq(0)

      api_post "/api/v1/sync/push", { records: [ refund.merge(id: SecureRandom.uuid).deep_merge(payload: { approved_by_membership_id: manager.id }) ] }, headers: device_headers(device)
      expect(json[:results].first[:status]).to eq("accepted"), response.body
      within(biz) do
        expect(Order.find(order_id).status).to eq("refunded")
        expect(Refund.first.approved_by_membership_id).to eq(manager.id)
      end
    end

    it "refuses a staff meal the till marked without an approver" do
      api_post "/api/v1/sync/push", { records: [ { type: "order", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", is_staff_meal: true, staff_meal_reason: "lunch",
        lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ] }, headers: device_headers(device)
      expect(json[:results].first).to include(status: "rejected", code: "approval.required")
      expect(within(biz) { Order.count }).to eq(0)
    end

    it "rejects a record whose id already exists in another business instead of failing the batch" do
      other = signup_business(name: "Other Cafe")
      om = build_menu!(other.business)
      existing = within(other.business) { Orders::Builder.create!({ order_type: "takeaway" }, lines: [ { product_id: om[:chai].id, quantity: 1 } ], actor: other, device: nil, branch: Branch.first).order }
      api_post "/api/v1/sync/push", { records: [ { type: "order", id: existing.id, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] } },
                                                 { type: "order", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ] }, headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      expect(json[:results].map { |r| r[:status] }).to eq(%w[rejected accepted])
      expect(json[:results].first[:code]).to eq("sync.duplicate_id")
    end

    it "gives the catalogue and customer downloads to tills and POS sessions, never to kitchen or rider tokens, without PIN digests" do
      kds = within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current, code: "K1") }
      get "/api/v1/sync/customers", headers: device_headers(kds)
      expect(response).to have_http_status(:forbidden)
      get "/api/v1/sync/customers", headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      get "/api/v1/sync/changes", headers: auth_headers(cashier, app: "kitchen")
      expect(response).to have_http_status(:forbidden)
      get "/api/v1/sync/changes", headers: auth_headers(cashier, app: "pos")
      expect(response).to have_http_status(:ok)
      expect(json[:staff].map(&:keys).flatten.uniq).not_to include(:pin_digest)
      api_post "/api/v1/sync/push", { records: [ { type: "order", id: SecureRandom.uuid, payload: {} } ] }, headers: device_headers(kds)
      expect(response).to have_http_status(:forbidden)
    end
  end

  it "lets a token screen read the ready list but never bump" do
    screen = within(biz) { Device.create!(branch: Branch.first, name: "Token", kind: "token_screen", paired_at: Time.current, code: "S1") }
    get "/api/v1/kitchen/ready", headers: device_headers(screen)
    expect(response).to have_http_status(:ok)
    api_post "/api/v1/kitchen/orders/#{SecureRandom.uuid}/bump", {}, headers: device_headers(screen)
    expect(response).to have_http_status(:forbidden)
  end

  it "stops a manager granting permissions they do not hold" do
    expect(manager.can?("billing.manage")).to be false
    api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: [ "orders.create", "billing.manage" ] }, headers: auth_headers(manager)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("permission.escalation")
    api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: [ "orders.create", "payments.take" ] }, headers: auth_headers(manager)
    expect(response).to have_http_status(:ok), response.body
    api_put "/api/v1/staff/#{cashier.id}/permissions", { codes: [ "orders.create", "billing.manage" ] }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  it "needs a permission to send a receipt by WhatsApp and to read a table's QR card" do
    order_id = paid_order!
    kitchen = add_member!(biz, "kitchen")
    api_post "/api/v1/orders/#{order_id}/receipt/send", { phone: "+923001234567" }, headers: auth_headers(kitchen)
    expect(response).to have_http_status(:forbidden)
    table = within(biz) { DiningTable.create!(branch: branch, code: "T9", seats: 2) }
    get "/api/v1/tables/#{table.id}/qr", headers: auth_headers(kitchen)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/tables/#{table.id}/qr", headers: headers
    expect(response).to have_http_status(:ok)
  end

  it "refuses a refund on a locked day" do
    order_id = paid_order!
    api_post "/api/v1/day_close/lock", { business_day: today_for(biz).to_s, force: true }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/orders/#{order_id}/refunds", { amount_minor: 9_280, method_code: "cash", reason: "cold" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("day.locked")
  end

  describe "two refunds of one order at the same moment" do
    # Threads need committed rows, so this group runs outside the test transaction and removes what it made afterwards.
    self.use_transactional_tests = false

    after do
      conn = ActiveRecord::Base.connection
      ids = Business.where(name: [ "Karachi Grill" ]).pluck(:id)
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

    it "records one refund and refuses the other" do
      order = within(biz) do
        o = Orders::Builder.create!({ order_type: "takeaway" }, lines: [ { product_id: m[:chai].id, quantity: 1 } ], actor: owner, device: nil, branch: Branch.first).order
        Payments::Processor.new(o, actor: owner).call(payments: [ { method_code: "cash", amount_minor: o.total_minor } ])
        o.reload
      end
      expect(order.status).to eq("paid")
      results = 2.times.map do
        Thread.new do
          ActiveRecord::Base.connection_pool.with_connection do
            Tenancy::Context.with(biz, user: owner.user, membership: owner) do
              Payments::Refunder.call(Order.find(order.id), amount_minor: order.total_minor, method_code: "cash", reason: "race", actor: owner)
              "ok"
            end
          end
        rescue Api::Errors::ApiError => e
          e.code
        end
      end.map(&:value)
      expect(results.count("ok")).to eq(1)
      expect(results.reject { |r| r == "ok" }.first).to start_with("refund.")
      within(biz) do
        expect(Refund.where(order_id: order.id).count).to eq(1)
        expect(Order.find(order.id)).to have_attributes(status: "refunded", paid_minor: 0)
      end
    end
  end
end

require "rails_helper"

# Taking a discount off an open order (leftovers of 7 Nov 2026, L1 item 3). A loyalty discount gives the points it
# spent back to whoever spent them, once, as a void does: removing, redeeming again and removing returns each
# redemption once, a void afterwards returns nothing more, and on an order carrying two (two tables merged) each gives
# back only its own. The automatic regular discount, which the till locks, comes off only for a member with
# discounts.apply (what adding a discount needs) or with a manager's PIN. Both are in the audit log.
RSpec.describe "Removing a discount", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:branch) { within(biz) { Branch.first } }
  let(:device) { within(biz) { Device.create!(branch: branch, name: "Till", kind: "till", paired_at: Time.current) } }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def h = auth_headers(owner)

  def place!(customer_id: nil, headers: h, **extra)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def remove!(order, discount, headers: h, **body)
    delete "/api/v1/orders/#{order[:id]}/discounts/#{discount[:id]}", params: body.to_json, headers: headers
  end

  def loyalty_discount(o) = o[:discounts].find { |d| d[:kind] == "loyalty" }
  def removal_audits(order) = within(biz) { AuditLog.where(action: "discount", record_id: order[:id]).where("after ->> 'removed' = 'true'").order(:occurred_at).to_a }

  describe "a loyalty discount" do
    before { api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true }, headers: h }

    let(:zara) { within(biz) { Customer.create!(name: "Zara", phone: "+923005556666", loyalty_points: 500) } }

    def redeem!(o, points)
      api_post "/api/v1/orders/#{o[:id]}/redeem_points", { points: points }, headers: h
      expect(response).to have_http_status(:ok), response.body
      json
    end

    it "gives the points back once each time it comes off, and a void afterwards gives nothing more" do
      o = place!(customer_id: zara.id)
      o = redeem!(o, 100)
      expect(zara.reload.loyalty_points).to eq(400)
      remove!(o, loyalty_discount(o))
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discounts]).to be_empty
      expect(zara.reload.loyalty_points).to eq(500)

      o = redeem!(o, 150)                                                  # redeemed again on the same order
      expect(zara.reload.loyalty_points).to eq(350)
      stale = loyalty_discount(o)
      remove!(o, stale)
      expect(response).to have_http_status(:ok), response.body
      expect(zara.reload.loyalty_points).to eq(500)
      remove!(o, stale)                                                    # the same removal again
      expect(response).to have_http_status(:not_found)

      api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Guest left" }, headers: h
      expect(response).to have_http_status(:ok), response.body
      expect(zara.reload.loyalty_points).to eq(500)
      within(biz) do
        rows = LoyaltyTransaction.where(order_id: o[:id]).order(:occurred_at, :created_at)
        expect(rows.map { |t| [ t.kind, t.points ] }).to eq([ [ "redeem", -100 ], [ "refund", 100 ], [ "redeem", -150 ], [ "refund", 150 ] ])
        expect(rows.last.discount_applied_id).to eq(stale[:id])
        expect(rows.last.by_membership_id).to eq(owner.id)
      end
      expect(removal_audits(o).map { |a| a.after["points_returned"] }).to eq([ 100, 150 ])
    end

    it "gives back what a redemption option spent" do
      option = within(biz) { LoyaltyRedemptionOption.create!(name: "Rs 100 off", kind: "fixed", value: 100, points: 120, active: true) }
      o = place!(customer_id: zara.id)
      api_post "/api/v1/orders/#{o[:id]}/redeem_option", { option_id: option.id }, headers: h
      expect(response).to have_http_status(:ok), response.body
      expect(zara.reload.loyalty_points).to eq(380)
      remove!(o, loyalty_discount(json))
      expect(response).to have_http_status(:ok), response.body
      expect(zara.reload.loyalty_points).to eq(500)
    end

    it "gives back only its own points on an order that carries two after two tables merged" do
      ali = within(biz) { Customer.create!(name: "Ali", phone: "+923007778888", loyalty_points: 300) }
      t1, t2 = within(biz) { [ DiningTable.create!(branch: branch, code: "T1", seats: 4), DiningTable.create!(branch: branch, code: "T2", seats: 4) ] }
      from = redeem!(place!(customer_id: zara.id, order_type: "dine_in", table_id: t1.id), 100)
      into = redeem!(place!(customer_id: ali.id, order_type: "dine_in", table_id: t2.id), 200)
      api_post "/api/v1/tables/#{t1.id}/merge", { into_table_id: t2.id }, headers: h
      expect(response).to have_http_status(:ok), response.body
      remove!(into, loyalty_discount(from))
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discounts].map { |d| d[:id] }).to eq([ loyalty_discount(into)[:id] ])
      expect([ zara.reload.loyalty_points, ali.reload.loyalty_points ]).to eq([ 500, 100 ])
      api_post "/api/v1/orders/#{into[:id]}/void", { reason: "Guest left" }, headers: h
      expect(response).to have_http_status(:ok), response.body
      expect([ zara.reload.loyalty_points, ali.reload.loyalty_points ]).to eq([ 500, 300 ])
    end

    it "gives back a redemption made before redemptions named their discount" do
      o = redeem!(place!(customer_id: zara.id), 100)
      within(biz) { LoyaltyTransaction.where(order_id: o[:id]).update_all(discount_applied_id: nil) }
      remove!(o, loyalty_discount(o))
      expect(response).to have_http_status(:ok), response.body
      expect(zara.reload.loyalty_points).to eq(500)
      api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Guest left" }, headers: h
      expect(zara.reload.loyalty_points).to eq(500)
    end
  end

  describe "the regular discount" do
    let(:sana) { within(biz) { Customer.create!(name: "Sana Farooq", phone: "+923001112233", last_order_at: 1.day.ago) } }
    let(:waiter) { add_member!(biz, "waiter", pin: "2222") }
    let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

    before { api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: h }

    def regular(o) = o[:discounts].find { |d| d[:kind] == "regular" }

    it "needs discounts.apply or a manager's PIN, and the log names the manager" do
      pos = auth_headers(waiter, app: "pos", device: device)
      o = place!(customer_id: sana.id, headers: pos)
      expect(regular(o)).to be_present
      remove!(o, regular(o), headers: pos)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error]).to include(code: "approval.required")
      expect(json[:error][:details][:permissions]).to eq([ "discounts.apply" ])
      expect(within(biz) { DiscountApplied.where(order_id: o[:id], kind: "regular").count }).to eq(1)

      remove!(o, regular(o), headers: pos, approver_pin: "9999", approval_codes: [ "discounts.apply" ])
      expect(response).to have_http_status(:ok), response.body
      expect(json[:discounts]).to be_empty
      expect(json[:total_minor]).to eq(o[:total_minor] + regular(o)[:amount_minor] * 116 / 100)
      expect(removal_audits(o).last).to have_attributes(approved_by_user_id: manager.user_id, user_id: waiter.user_id)

      o2 = place!(customer_id: sana.id, headers: auth_headers(cashier, app: "pos", device: device))
      remove!(o2, regular(o2), headers: auth_headers(cashier, app: "pos", device: device))
      expect(response).to have_http_status(:ok), response.body                # the cashier holds discounts.apply
      expect(removal_audits(o2).last.approved_by_user_id).to be_nil
    end

    it "leaves any other discount to whoever takes the order, as before" do
      pos = auth_headers(waiter, app: "pos", device: device)
      o = place!(headers: pos)
      api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "percent", value: 5, reason: "Birthday" }, headers: h
      expect(response).to have_http_status(:ok), response.body
      remove!(o, json[:discounts].first, headers: pos)
      expect(response).to have_http_status(:ok), response.body
    end
  end
end

require "rails_helper"

# A void gives back what the order consumed: a personal voucher is usable again, a public code and a
# one-use coupon get their use back, and loyalty points go back to whoever spent them, once (review of
# 6 Nov 2026, R7).
RSpec.describe "Void: vouchers, coupon uses and loyalty points given back", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def place!(product = m[:burger], customer_id: nil, **extra)
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [ { product_id: product.id, quantity: 1 } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def void!(order)
    api_post "/api/v1/orders/#{order[:id]}/void", { reason: "Guest left" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
  end

  let(:sara) { within(biz) { Customer.create!(name: "Sara", phone: "+923001112233") } }

  it "makes a personal voucher usable again and gives a public code its use back" do
    api_post "/api/v1/voucher_batches", { name: "Eid gift", kind: "personal", value_kind: "fixed", value: 100 }, headers: headers
    batch = json
    api_post "/api/v1/voucher_batches/#{batch[:id]}/issue", { customer_ids: [ sara.id ], send: false }, headers: headers
    code = json[:data].first[:code]
    o1 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o1[:id]}/discounts", { voucher_code: code }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    void!(o1)
    within(biz) do
      v = Voucher.find_by!(code: code)
      expect(v).to have_attributes(status: "issued", redeemed_order_id: nil, redeemed_at: nil)
      expect(VoucherBatch.find(batch[:id]).redeemed_count).to eq(0)
    end
    o2 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o2[:id]}/discounts", { voucher_code: code }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(within(biz) { Voucher.find_by!(code: code).redeemed_order_id }).to eq(o2[:id])

    api_post "/api/v1/voucher_batches", { name: "Social", kind: "public", public_code: "EID50", value_kind: "percent", value: 50, usage_limit: 1 }, headers: headers
    o3 = place!
    api_post "/api/v1/orders/#{o3[:id]}/discounts", { voucher_code: "EID50" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    void!(o3)
    within(biz) do
      expect(VoucherBatch.find_by!(public_code: "EID50").redeemed_count).to eq(0)
      # The code made for that one use is retired, not left lying around as a spare voucher.
      expect(Voucher.where("code LIKE 'EID50-%'").pluck(:status)).to eq(%w[void])
    end
    o4 = place!
    api_post "/api/v1/orders/#{o4[:id]}/discounts", { voucher_code: "EID50" }, headers: headers
    expect(response).to have_http_status(:ok), response.body # not voucher.exhausted
  end

  it "never takes a voucher back from the order that redeemed it after a void gave it back" do
    api_post "/api/v1/voucher_batches", { name: "Eid gift", kind: "personal", value_kind: "fixed", value: 100 }, headers: headers
    batch = json
    api_post "/api/v1/voucher_batches/#{batch[:id]}/issue", { customer_ids: [ sara.id ], send: false }, headers: headers
    code = json[:data].first[:code]
    o1 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o1[:id]}/discounts", { voucher_code: code }, headers: headers
    stale = json[:discounts].find { |d| d[:kind] == "voucher" }
    void!(o1)
    o2 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o2[:id]}/discounts", { voucher_code: code }, headers: headers
    # The voided order still lists its old discount; removing it must not hand o2's voucher out a second time.
    api_post "/api/v1/orders/#{o1[:id]}/void", { reason: "again" }, headers: headers
    expect(json[:error][:code]).to eq("order.status")
    delete "/api/v1/orders/#{o1[:id]}/discounts/#{stale[:id]}", headers: headers
    within(biz) do
      expect(Voucher.find_by!(code: code)).to have_attributes(status: "redeemed", redeemed_order_id: o2[:id])
      expect(VoucherBatch.find(batch[:id]).redeemed_count).to eq(1)
    end
  end

  it "gives a one-use coupon (a birthday offer) its use back" do
    promo = within(biz) { Promotion.create!(name: "Birthday offer for Sara", kind: "coupon", value: 10, coupon_code: "BDAY0611", valid_from: 1.hour.ago, valid_to: 7.days.from_now, unit_limit: 1) }
    o1 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o1[:id]}/discounts", { coupon_code: "BDAY0611" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(promo.reload.units_sold).to eq(1)
    void!(o1)
    expect(promo.reload.units_sold).to eq(0)
    o2 = place!(customer_id: sara.id)
    api_post "/api/v1/orders/#{o2[:id]}/discounts", { coupon_code: "BDAY0611" }, headers: headers
    expect(response).to have_http_status(:ok), response.body # not coupon.unavailable
  end

  it "returns redeemed points to the customer who spent them, once, even after the order's customer changed" do
    api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true }, headers: headers
    zara = within(biz) { Customer.create!(name: "Zara", phone: "+923005556666", loyalty_points: 500) }
    ali = within(biz) { Customer.create!(name: "Ali", phone: "+923007778888", loyalty_points: 20) }
    o = place!(customer_id: zara.id)
    api_post "/api/v1/orders/#{o[:id]}/redeem_points", { points: 100 }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(zara.reload.loyalty_points).to eq(400)
    api_patch "/api/v1/orders/#{o[:id]}", { customer_id: ali.id }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    void!(o)
    expect(zara.reload.loyalty_points).to eq(500)
    expect(ali.reload.loyalty_points).to eq(20)
    within(biz) do
      Loyalty.refund_on_void!(Order.find(o[:id])) # a second call (a retried job, say) refunds nothing more
      expect(zara.reload.loyalty_points).to eq(500)
      expect(LoyaltyTransaction.where(order_id: o[:id]).pluck(:kind).sort).to eq(%w[redeem refund])
    end
  end

  it "releases what a merged table brought with it when the surviving order is voided" do
    api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true }, headers: headers
    zara = within(biz) { Customer.create!(name: "Zara", phone: "+923005556666", loyalty_points: 500) }
    api_post "/api/v1/voucher_batches", { name: "Eid gift", kind: "personal", value_kind: "fixed", value: 50 }, headers: headers
    batch = json
    api_post "/api/v1/voucher_batches/#{batch[:id]}/issue", { customer_ids: [ zara.id ], send: false }, headers: headers
    code = json[:data].first[:code]
    t1, t2 = within(biz) { [ DiningTable.create!(branch: branch, code: "T1", seats: 4), DiningTable.create!(branch: branch, code: "T2", seats: 4) ] }
    from = place!(customer_id: zara.id, order_type: "dine_in", table_id: t1.id)
    api_post "/api/v1/orders/#{from[:id]}/discounts", { voucher_code: code }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    api_post "/api/v1/orders/#{from[:id]}/redeem_points", { points: 100 }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    into = place!(order_type: "dine_in", table_id: t2.id)
    api_post "/api/v1/tables/#{t1.id}/merge", { into_table_id: t2.id }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    void!(into)
    expect(zara.reload.loyalty_points).to eq(500)
    expect(within(biz) { Voucher.find_by!(code: code).status }).to eq("issued")
  end
end

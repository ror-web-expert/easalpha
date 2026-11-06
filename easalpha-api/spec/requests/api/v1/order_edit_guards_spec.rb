require "rails_helper"

# Edits that reached orders they should not have (review of 6 Nov 2026 and QA the same evening): a discount taken off
# a settled sale or one on a locked day (orders-money#5), an update that re-dated the order (orders-money#7), and a
# create carrying a finished order's id that answered with the order and dropped the new lines (T9).
RSpec.describe "Order edit guards", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def order!(**extra)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  describe "taking a discount off (orders-money#5)" do
    it "refuses on a paid order, so its total and its voucher stay as sold" do
      batch = within(biz) { VoucherBatch.create!(name: "Eid", kind: "public", public_code: "EID50", value_kind: "fixed", value: 50) }
      o = order!
      api_post "/api/v1/orders/#{o[:id]}/discounts", { voucher_code: "EID50" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      discount = json[:discounts].first
      paid = pay!(json)
      delete "/api/v1/orders/#{o[:id]}/discounts/#{discount[:id]}", headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("order.not_editable")
      within(biz) do
        expect(Order.find(o[:id])).to have_attributes(status: "paid", payment_status: "paid", total_minor: paid[:total_minor])
        expect(DiscountApplied.where(order_id: o[:id]).count).to eq(1)
        expect(batch.reload.redeemed_count).to eq(1)
        expect(Voucher.find_by!(redeemed_order_id: o[:id]).status).to eq("redeemed")
      end
    end

    it "refuses on an open order of a day locked by force, as adding one does" do
      o = order!
      api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "fixed", value: 50, reason: "Regular" }, headers: headers
      d = json[:discounts].first
      api_post "/api/v1/day_close/lock", { business_day: o[:business_day], force: true }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      delete "/api/v1/orders/#{o[:id]}/discounts/#{d[:id]}", headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      api_post "/api/v1/orders/#{o[:id]}/discounts", { kind: "fixed", value: 20, reason: "More" }, headers: headers
      expect(json[:error][:code]).to eq("day.locked")
      within(biz) { expect(Order.find(o[:id]).discount_minor).to eq(5_000) }
    end
  end

  describe "the order's time on an update (orders-money#7)" do
    it "keeps the time the order was made with, so an edit cannot date it back and buy a regular-discount tier" do
      api_post "/api/v1/regular_discount_tiers", { name: "Back within 3 days", within_days: 3, kind: "percent", value: 10 }, headers: headers
      cust = within(biz) { Customer.create!(name: "Sana", last_order_at: 40.days.ago) }
      made = 2.minutes.ago.change(usec: 0)
      o = order!(customer_id: cust.id, client_created_at: made.iso8601)
      expect(o[:discount_minor]).to eq(0)
      api_patch "/api/v1/orders/#{o[:id]}", { client_created_at: "2025-01-01T10:00:00Z", customer_id: cust.id, lines: [ { id: o[:items].first[:id], quantity: 1 } ] }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(discount_minor: 0, total_minor: o[:total_minor])
      expect(Time.iso8601(json[:client_created_at])).to eq(made)
    end
  end

  describe "a create with the id of a finished order (QA T9)" do
    it "answers 409 order.closed with the order, so the till starts a new one instead of losing the lines" do
      o = order!
      pay!(o)
      api_post "/api/v1/orders", { id: o[:id], order_type: "walk_in", lines: [ { product_id: m[:burger].id }, { product_id: m[:chai].id } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "order.closed", message: "#{o[:label]} is already paid: start a new order")
      expect(json[:error][:details][:order]).to include(id: o[:id], status: "paid")
      within(biz) { expect(OrderItem.where(order_id: o[:id]).count).to eq(1) }
    end

    it "answers a save of a finished order, and its tax choice, with order.closed too, so the till starts over from any save" do
      o = order!
      pay!(o)
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: o[:items].first[:id], quantity: 2 } ] }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "order.closed", message: "#{o[:label]} is already paid: start a new order")
      expect(json[:error][:details][:order]).to include(id: o[:id], status: "paid")
      api_post "/api/v1/orders/#{o[:id]}/tax_choice", { none: true }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("order.closed")
      within(biz) { expect(OrderItem.find(o[:items].first[:id]).quantity).to eq(1) }
    end

    it "still answers a repeated create of an open order with that order" do
      id = SecureRandom.uuid
      2.times { api_post "/api/v1/orders", { id: id, order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers }
      expect(response).to have_http_status(:ok)
      expect(json).to include(id: id, status: "placed")
    end
  end
end

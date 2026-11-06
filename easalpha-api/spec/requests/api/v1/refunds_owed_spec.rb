require "rails_helper"

# What an order still owes once money has gone back (QA and review of 6 Nov 2026).
# T8: a part refund of a paid order left it "Partial", the reprint said "BALANCE DUE" for the refunded amount, and the
# reopened order asked for it again: a refund on a settled order corrects the sale, it does not make it owed.
# orders-money#3: the next payment reset paid_minor to the captured total, so a refund was forgotten and a part payment
# completed the order. ledger#0 / orders-money#2: a part payment on an open order could not be given back, so the order
# could be neither voided nor completed and the day not closed. T5 and T11: the till user, with a manager's PIN,
# reopens a paid order, lowers it, refunds the excess and completes it.
RSpec.describe "Refunds and what an order still owes", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) } # Zinger Burger Rs 522 and Chai Rs 92.80 with tax
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def order!(lines = [ { product_id: m[:burger].id } ], h = headers)
    api_post "/api/v1/orders", { order_type: "takeaway", lines: lines, place: true }, headers: h
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o, amount, method: "cash", h: headers)
    line = { method_code: method, amount_minor: amount }
    line[:reference] = "REF#{SecureRandom.hex(2)}" if method == "card"
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ line ] }, headers: h
    expect(response).to have_http_status(:created), response.body
    json[:order]
  end

  def refund!(o, amount, method: "cash", h: headers, **extra)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: method, reason: "Cold fries" }.merge(extra), headers: h
  end

  describe "a part refund of a paid order (T8)" do
    it "leaves it paid with nothing due, on the order, its receipt and once reopened" do
      o = pay!(order!, 52_200)
      refund!(o, 10_000)
      expect(response).to have_http_status(:created), response.body
      expect(json[:order]).to include(status: "paid", payment_status: "paid", paid_minor: 52_200, due_minor: 0)

      get "/api/v1/orders/#{o[:id]}/receipt", headers: headers
      expect(json[:totals]).to include(total_minor: 52_200, paid_minor: 52_200, due_minor: 0)
      expect(json[:refunds]).to eq([ { method: "cash", amount_minor: 10_000, reason: "Cold fries" } ])

      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      expect(json).to include(status: "served", payment_status: "paid", due_minor: 0)
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 10_000 } ] }, headers: headers
      expect(response).to have_http_status(:conflict) # nothing is owed: the refund is not asked for again
      expect(json[:error][:code]).to eq("payment.overpaid")
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(status: "closed", payment_status: "paid", due_minor: 0)
    end

    it "asks a reopened order only for what was added to it, then completes it when that is paid" do
      o = pay!(order!, 52_200)
      refund!(o, 10_000)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      burger = json[:items].first
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
      expect(json).to include(total_minor: 61_480, paid_minor: 52_200, due_minor: 9_280, payment_status: "partial")
      expect(pay!(o, 9_280)).to include(status: "paid", payment_status: "paid", paid_minor: 61_480, due_minor: 0)
    end

    it "owes nothing once refunded in full, on the receipt too" do
      o = pay!(order!, 52_200)
      refund!(o, 10_000)
      refund!(o, 52_200) # what the screen offers: the order still reads paid in full
      expect(json[:error]).to include(code: "refund.too_much", details: { refundable_minor: 42_200 })
      refund!(o, 42_200)
      expect(json[:order]).to include(status: "refunded", payment_status: "refunded", paid_minor: 0, due_minor: 0)
      get "/api/v1/orders/#{o[:id]}/receipt", headers: headers
      expect(json[:totals]).to include(due_minor: 0)
      refund!(o, 100)
      expect(json[:error][:code]).to eq("refund.not_paid")
    end
  end

  describe "a payment after money went back (orders-money#3)" do
    it "counts the refund, so a reopened order is not completed on a part payment" do
      o = order!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ])
      pay!(o, 61_480)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      burger = json[:items].find { |i| i[:name] == "Zinger Burger" }
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], quantity: 1 } ] }, headers: headers
      refund!(o, 9_280) # the chai's excess goes back while the order is open
      expect(json[:order]).to include(status: "served", paid_minor: 52_200)
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], quantity: 1 }, { product_id: m[:chai].id, quantity: 1 } ] }, headers: headers
      expect(json).to include(total_minor: 61_480, due_minor: 9_280)
      expect(pay!(o, 5_000)).to include(status: "served", payment_status: "partial", paid_minor: 57_200, due_minor: 4_280)
      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: headers
      expect(json[:error][:code]).to eq("order.unpaid")
      expect(pay!(o, 4_280)).to include(status: "paid", paid_minor: 61_480)
    end
  end

  describe "a part payment on an open order (ledger#0, orders-money#2)" do
    it "goes back, the order stays open and owes it again, then it can be voided and the day closed" do
      cust = within(biz) { Customer.create!(name: "Hamza") }
      api_post "/api/v1/orders", { order_type: "takeaway", customer_id: cust.id, lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
      o = json
      expect(pay!(o, 20_000, method: "card")).to include(status: "placed", payment_status: "partial", paid_minor: 20_000)
      refund!(o, 20_000, method: "card")
      expect(response).to have_http_status(:created), response.body
      expect(json[:order]).to include(status: "placed", payment_status: "unpaid", paid_minor: 0, due_minor: 52_200)
      expect(cust.reload).to have_attributes(orders_count: 0, net_spent_minor: 0) # never counted, so nothing comes off
      api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Customer left" }, headers: headers
      expect(response).to have_http_status(:ok), response.body
      expect(json[:status]).to eq("voided")
      api_post "/api/v1/day_close/lock", { business_day: o[:business_day] }, headers: headers
      expect(response).to have_http_status(:ok), response.body
    end

    it "keeps the order paid for what was not given back: no void until all of it is, and a later payment counts from there" do
      o = order!
      pay!(o, 20_000, method: "card")
      refund!(o, 5_000, method: "card")
      expect(json[:order]).to include(status: "placed", payment_status: "partial", paid_minor: 15_000, due_minor: 37_200)
      api_post "/api/v1/orders/#{o[:id]}/void", { reason: "Customer left" }, headers: headers
      expect(json[:error][:code]).to eq("order.paid")
      refund!(o, 15_001, method: "card")
      expect(json[:error]).to include(code: "refund.too_much", message: "Refund exceeds what was paid: Rs 150 is left to refund on #{o[:label]}", details: { refundable_minor: 15_000 })
      expect(pay!(o, 30_000)).to include(status: "placed", payment_status: "partial", paid_minor: 45_000, due_minor: 7_200)
    end

    it "takes only the excess back while an open order is paid in full, as before" do
      o = pay!(order!, 52_200)
      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: headers
      refund!(o, 100)
      expect(response).to have_http_status(:conflict)
      expect(json[:error]).to include(code: "refund.order_open", message: "Order #{o[:label]} is open and paid in full: complete it before refunding.")
    end
  end

  describe "the till user with a manager's PIN (T5, T11)" do
    let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }
    let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
    let!(:manager) { add_member!(biz, "manager", pin: "9999") }
    let(:pos) { auth_headers(cashier, app: "pos", device: device) }

    def with_pin(codes) = { approver_pin: "9999", approval_codes: codes }

    it "reopens a paid order, takes a line off, refunds the excess and completes it with nothing due" do
      o = order!([ { product_id: m[:burger].id }, { product_id: m[:chai].id } ], pos)
      pay!(o, 61_480, h: pos)

      api_post "/api/v1/orders/#{o[:id]}/reopen", {}, headers: pos
      expect(response).to have_http_status(:forbidden)
      expect(json[:error]).to include(code: "approval.required", details: { permissions: [ "REOPEN_ORDER" ], labels: { REOPEN_ORDER: "Reopen order" } })
      api_post "/api/v1/orders/#{o[:id]}/reopen", with_pin(%w[REOPEN_ORDER]), headers: pos
      expect(response).to have_http_status(:ok), response.body
      expect(json[:status]).to eq("served")
      within(biz) { expect(AuditLog.where(record_id: o[:id], action: "update", approved_by_user_id: manager.user_id)).to exist }

      burger = json[:items].find { |i| i[:name] == "Zinger Burger" }
      api_patch "/api/v1/orders/#{o[:id]}", { lines: [ { id: burger[:id], quantity: 1 } ] }.merge(with_pin(%w[DELETE_ORDER_ITEM])), headers: pos
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(total_minor: 52_200, paid_minor: 61_480, due_minor: 0)

      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: pos
      expect(json[:error]).to include(code: "order.overpaid", details: { refund_minor: 9_280, paid_minor: 61_480, total_minor: 52_200 })
      refund!(o, 9_280, h: pos, reason: "Chai taken off")
      expect(json[:error]).to include(code: "approval.required", details: { permissions: [ "orders.refund" ], labels: { "orders.refund": "Refund after payment" } })
      refund!(o, 9_280, h: pos, **with_pin(%w[orders.refund]))
      expect(response).to have_http_status(:created), response.body
      expect(json[:refund][:approved_by_membership_id]).to eq(manager.id)
      expect(json[:order]).to include(status: "served", paid_minor: 52_200, due_minor: 0, payment_status: "paid")

      api_post "/api/v1/orders/#{o[:id]}/complete", {}, headers: pos
      expect(response).to have_http_status(:ok), response.body
      expect(json).to include(status: "closed", payment_status: "paid", paid_minor: 52_200, due_minor: 0)
    end

    it "does not reopen on a PIN the dialog did not show for reopening" do
      o = pay!(order!([ { product_id: m[:chai].id } ], pos), 9_280, h: pos)
      api_post "/api/v1/orders/#{o[:id]}/reopen", with_pin(%w[orders.void]), headers: pos
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:details][:permissions]).to eq([ "REOPEN_ORDER" ])
      within(biz) { expect(Order.find(o[:id]).status).to eq("paid") }
    end
  end
end

require "rails_helper"

RSpec.describe Orders::PartRefundRepair, type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def paid_order!
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id, quantity: 2 } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    o
  end

  it "puts an order part-refunded under the old rule back to paid, and leaves full refunds and unpaid orders alone" do
    o = paid_order!
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 1_000, method_code: "cash", reason: "Cold" }, headers: headers
    expect(response).to have_http_status(:created), response.body
    # The order as the old refund rule left it: paid lowered by the refund, "partial", a balance due on the receipt.
    within(biz) { Order.find(o[:id]).update_columns(paid_minor: o[:total_minor] - 1_000, payment_status: "partial") }
    full = paid_order!
    api_post "/api/v1/orders/#{full[:id]}/refunds", { amount_minor: full[:total_minor], method_code: "cash", reason: "Wrong order" }, headers: headers
    expect(response).to have_http_status(:created), response.body

    rows = within(biz) { described_class.run!(dry_run: true) }
    expect(rows.map { |r| r[:order] }).to eq([ within(biz) { Order.find(o[:id]).label } ])
    expect(within(biz) { Order.find(o[:id]).payment_status }).to eq("partial") # a dry run writes nothing

    within(biz) { described_class.run!(dry_run: false) }
    within(biz) do
      fixed = Order.find(o[:id])
      expect(fixed).to have_attributes(paid_minor: o[:total_minor], payment_status: "paid", due_minor: 0)
      expect(Order.find(full[:id]).payment_status).to eq("refunded")
      expect(AuditLog.where(record_id: o[:id], action: "update").last.after).to include("reason" => "part refund repair")
    end
    expect(within(biz) { described_class.run!(dry_run: true) }).to be_empty # a second run finds nothing
  end
end

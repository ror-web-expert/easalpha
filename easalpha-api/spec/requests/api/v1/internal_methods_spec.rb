require "rails_helper"

# Final round, item 14: the canteen's company share and the salary deduction are internal payment methods; they move no
# money. Only the system's own paths use them (the canteen claim and its cancel, the payroll deduction). A user's
# payment or refund naming one, online or from the sync queue, was taken all the same.
RSpec.describe "Internal payment methods from a user", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  before do
    within(biz) do
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      Canteen::Claims.internal_method!(Canteen::Claims::SUBSIDY_CODE, "Company subsidy")
      Canteen::Claims.internal_method!(Canteen::Claims::PAYROLL_CODE, "Salary deduction")
    end
  end

  def order!
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  it "refuses a payment by one and takes nothing" do
    o = order!
    %w[canteen_subsidy canteen_payroll].each do |code|
      api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: code, amount_minor: o[:total_minor] } ] }, headers: headers
      expect(response).to have_http_status(422)
      expect(json[:error][:code]).to eq("payment.method_internal")
    end
    within(biz) { expect(Payment.where(order_id: o[:id])).to be_empty }
  end

  it "refuses a refund by one" do
    o = order!
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 1_000, method_code: "canteen_subsidy", reason: "Cold tea" }, headers: headers
    expect(response).to have_http_status(422)
    expect(json[:error]).to include(code: "refund.method_internal", message: "Company subsidy is the system's own method: refund in cash, by card, wallet or bank, or to the account")
    within(biz) { expect(Refund.count).to eq(0) }
  end

  it "rejects one from the sync queue" do
    device = within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) }
    cashier = add_member!(biz, "cashier", pin: "1111")
    o = order!
    record = { type: "payment", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: o[:id], method_code: "canteen_subsidy", amount_minor: o[:total_minor] } }
    api_post "/api/v1/sync/push", { records: [ record ] }, headers: auth_headers(cashier, app: "pos", device: device)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:results].first).to include(status: "rejected", code: "payment.method_internal")
    within(biz) { expect(Payment.where(order_id: o[:id])).to be_empty }
  end
end

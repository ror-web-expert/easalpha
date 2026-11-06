require "rails_helper"

# Cash and khata go by the payment method's kind, never its code (review of 6 Nov 2026, R26). A business can add a
# second method of a kind (cash on delivery, a staff tab): the till, the drawer and the customer's balance already
# took it as cash or as a sale on account, while the statement, the balance rebuild, the Z report, the reconciliation,
# the reports, the receipt, the sale message and the cash rounding looked for the codes "cash" and "khata".
RSpec.describe "Payment methods by kind", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:today) { today_for(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def add_method!(code, name, kind)
    api_post "/api/v1/payment_methods", { code: code, name: name, kind: kind, works_offline: true }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  def open_shift!
    api_post "/api/v1/shifts", { opening_cash_minor: 10_000 }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def order!(product, extra = {})
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: product.id } ], place: true }.merge(extra), headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def pay!(o, code, amount = o[:total_minor])
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: code, amount_minor: amount } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    json
  end

  def refund!(o, code, amount)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: amount, method_code: code, reason: "cold" }, headers: headers
    expect(response).to have_http_status(:created), response.body
  end

  it "takes a second cash method as cash: the old shifts' expected cash, the cash rounding and its repair" do
    add_method!("cod", "Cash on delivery", "cash")
    shift = open_shift!
    pay!(order!(m[:chai]), "cod") # Rs 92.80
    get "/api/v1/shifts/#{shift[:id]}/z_report", headers: headers
    expect(json[:cash]).to include(cash_sales_minor: 9_280, expected_minor: 19_280)
    # A shift from before drawer accounts sums its own rows, and the second cash method's sale is one of them.
    expect(within(biz) { Shift.find(shift[:id]).legacy_expected_cash }).to eq(19_280)

    within(biz) { Setting.write!(biz, { "cash_rounding" => 10 }) }
    paid = pay!(order!(m[:chai]), "cod", 9_000) # rounded to Rs 90, as for Cash
    expect(paid[:order]).to include(total_minor: 9_000, cash_rounding_minor: -280, payment_status: "paid")

    # The regular-discount repair rounds a corrected total the same way when the money came in by any cash method.
    part = order!(m[:chai])
    within(biz) { Setting.write!(biz, { "cash_rounding" => 0 }) }
    pay!(part, "cod", 5_000)
    within(biz) do
      Setting.write!(biz, { "cash_rounding" => 10 })
      order = Order.find(part[:id])
      Orders::RegularDiscountRepair.reround!(order)
      expect(order).to have_attributes(cash_rounding_minor: -280, total_minor: 9_000)
    end
  end

  it "takes a second khata method as a sale on account in the statement, the rebuild, the Z report, the reports, the receipt, the reconciliation and the sale message" do
    add_method!("tab", "Staff tab", "khata")
    allow(Customers::Notify).to receive(:deliver).and_return([])
    rao, sana = within(biz) { [ Customer.create!(name: "Rao Bilal"), Customer.create!(name: "Sana Farooq") ] }
    shift = open_shift!
    burger = order!(m[:burger], customer_id: rao.id)
    pay!(burger, "tab") # Rs 522 on account
    expect(Customers::Notify).to have_received(:deliver).with(having_attributes(id: rao.id), "account_receipt", hash_including(order_total: "522"))
    refund!(burger, "tab", 10_000)
    chai = order!(m[:chai], customer_id: sana.id)
    pay!(chai, "tab")
    refund!(chai, "tab", 9_280) # all of it: Sana's account is back to zero
    pay!(order!(m[:chai]), "cash")

    get "/api/v1/customers/#{rao.id}/ledger", headers: headers
    expect(json).to include(balance_minor: 42_200, closing_balance_minor: 42_200)
    expect(json[:totals]).to include(charges_minor: 52_200, refunds_minor: 10_000)
    get "/api/v1/customers/#{sana.id}/ledger?from=#{today}&to=#{today}", headers: headers
    expect(json).to include(balance_minor: 0, closing_balance_minor: 0)
    expect(json[:entries].map { |e| e[:kind] }).to eq(%w[charge refund])
    expect(within(biz) { Balances::Rebuild.customers! }).to eq(0)
    expect(within(biz) { Customer.find(rao.id).balance_minor }).to eq(42_200)
    # The month's bills list every customer with account activity, Sana too though she owes nothing now.
    get "/api/v1/customer_bills?from=#{today}&to=#{today}", headers: headers
    expect(json[:rows].map { |r| r[:customer][:id] }).to contain_exactly(rao.id, sana.id)

    get "/api/v1/shifts/#{shift[:id]}/z_report", headers: headers
    expect(json[:khata]).to include(on_account_minor: 61_480)
    get "/api/v1/reports/branches", headers: headers
    expect(json[:rows].first).to include(khata_minor: 61_480)
    get "/api/v1/reports/grand_spec?from=#{today}&to=#{today}", headers: headers
    expect(json[:on_account_minor]).to eq(61_480)
    get "/api/v1/orders/#{burger[:id]}/receipt", headers: headers
    expect(json[:khata]).to eq(balance_minor: 42_200)

    # Nothing on account moves a money account: the cash sale is all the ledger should hold, refunds included.
    get "/api/v1/finance/reconciliation?business_day=#{today}", headers: headers
    expect(json).to include(khata_minor: 61_480, expected_posted_minor: 9_280, posted_minor: 9_280, refunds_minor: 19_280, khata_refunds_minor: 19_280,
                            posted_refunds_minor: 0, refund_difference_minor: 0, balanced: true)
  end
end

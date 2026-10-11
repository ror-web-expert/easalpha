require "rails_helper"

RSpec.describe "Payments and receipts", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:manager) { add_member!(biz, "manager", pin: "9999") }

  def new_order(lines: [ { product_id: m[:chai].id } ], extra: {}, as: headers)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: lines }.merge(extra), headers: as
    json
  end

  it "seeds payment methods and accounts at signup" do
    get "/api/v1/payment_methods", headers: headers
    expect(json[:data].map { |x| x[:code] }).to include("cash", "card", "easypaisa", "jazzcash", "bank", "raast", "khata")
    get "/api/v1/payment_accounts", headers: headers
    expect(json[:data].map { |a| a[:name] }).to include("Cash", "EasyPaisa", "JazzCash", "Bank")
  end

  it "pays a draft in cash with rounding and change, places it, marks it paid, posts to the cash account and returns a receipt" do
    within(biz) { biz.update!(settings: { "cash_rounding" => 5 }) }
    o = new_order(lines: [ { product_id: m[:burger].id } ]) # 45,000 + 7,200 tax = 52,200 -> rounds to 52,000? step 500 minor: 52,200 -> 52,000
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 52_000, tendered_minor: 100_000 } ] }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:order][:rounding_minor]).to eq(-200)
    expect(json[:order][:total_minor]).to eq(52_000)
    expect(json[:order][:status]).to eq("paid")
    expect(json[:order][:payment_status]).to eq("paid")
    expect(json[:order][:serial]).to eq(1)
    expect(json[:change_minor]).to eq(48_000)
    expect(json[:receipt][:totals][:total_minor]).to eq(52_000)
    expect(json[:receipt][:receipt_number]).to match(/\A\d{6}-B1-1\z/)
    expect(json[:receipt][:payments].first).to include(method: "cash", change_minor: 48_000)
    get "/api/v1/payment_accounts", headers: headers
    cash = json[:data].find { |a| a[:name] == "Cash" }
    expect(cash[:current_balance_minor]).to eq(52_000)
    get "/api/v1/payment_accounts/#{cash[:id]}/entries", headers: headers
    expect(json[:data].first).to include(kind: "order_payment", amount_minor: 52_000)
  end

  it "splits a payment across cash and EasyPaisa, requires a reference for wallets, and rejects overpayment by wallet" do
    o = new_order(lines: [ { product_id: m[:burger].id } ], extra: { place: true }) # 52,200
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "easypaisa", amount_minor: 30_000 } ] }, headers: headers
    expect(response).to have_http_status(:bad_request)
    expect(json[:error][:code]).to eq("payment.reference_required")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "easypaisa", amount_minor: 30_000, reference: "EP123" } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:order][:payment_status]).to eq("partial")
    expect(json[:order][:paid_minor]).to eq(30_000)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "easypaisa", amount_minor: 30_000, reference: "EP124" } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("payment.overpaid")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 22_200, tendered_minor: 25_000 } ], tip_minor: 1_000 }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:order][:tip_minor]).to eq(1_000)
    expect(json[:order][:total_minor]).to eq(53_200)
    expect(json[:order][:payment_status]).to eq("partial")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 1_000 } ] }, headers: headers
    expect(json[:order][:payment_status]).to eq("paid")
    expect(json[:order][:payment_method_summary]).to include("cash:", "easypaisa:30000")
  end

  it "is idempotent on the payment id" do
    o = new_order(extra: { place: true })
    pid = SecureRandom.uuid
    2.times { api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { id: pid, method_code: "cash", amount_minor: 9_280 } ] }, headers: headers }
    expect(response).to have_http_status(:created)
    within(biz) { expect(Payment.where(order_id: o[:id]).count).to eq(1) }
    expect(json[:order][:paid_minor]).to eq(9_280)
  end

  it "puts an order on khata, enforces the credit limit, collects a payment later and messages the customer" do
    api_post "/api/v1/customers", { name: "Rao Bilal", phone: "03491234567", credit_limit_minor: 20_000 }, headers: headers
    cust = json[:id]
    o = new_order(lines: [ { product_id: m[:chai].id } ], extra: { customer_id: cust, place: true }) # 9,280
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 9_280 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:order][:status]).to eq("paid")
    expect(json[:receipt][:khata][:balance_minor]).to eq(9_280)
    get "/api/v1/customers/#{cust}", headers: headers
    expect(json[:balance_minor]).to eq(9_280)
    expect(json[:orders_count]).to eq(1)
    o2 = new_order(lines: [ { product_id: m[:burger].id } ], extra: { customer_id: cust, place: true }) # 52,200 > limit
    api_post "/api/v1/orders/#{o2[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 52_200 } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("khata.over_limit")
    api_post "/api/v1/customers/#{cust}/payments", { amount_minor: 5_000, method_code: "easypaisa", reference: "Cleared by Shahzad" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:customer][:balance_minor]).to eq(4_280)
    expect(json[:payment][:number]).to eq(1)
    within(biz) do
      expect(WhatsappMessage.where(business_id: biz.id, template_name: "khata_payment_received").count).to eq(1)
      expect(PaymentAccount.find_by!(name: "EasyPaisa").current_balance_minor).to eq(5_000)
    end
    walk_in = within(biz) { Customer.walk_in }
    o3 = new_order(extra: { customer_id: walk_in.id, place: true })
    api_post "/api/v1/orders/#{o3[:id]}/payments", { payments: [ { method_code: "khata", amount_minor: 9_280 } ] }, headers: headers
    expect(json[:error][:code]).to eq("khata.walk_in")
  end

  it "refunds only with a manager, in part or in full, and posts negative entries" do
    o = new_order(lines: [ { product_id: m[:burger].id } ], extra: { place: true })
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 52_200 } ] }, headers: auth_headers(cashier)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 10_000, method_code: "cash", reason: "Cold food" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    manager
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 10_000, method_code: "cash", reason: "Cold food", approver_pin: "9999" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    expect(json[:order][:payment_status]).to eq("partial")
    expect(json[:order][:paid_minor]).to eq(42_200)
    expect(json[:refund][:approved_by_membership_id]).to eq(manager.id)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 50_000, method_code: "cash", reason: "too much" }, headers: headers
    expect(response).to have_http_status(:conflict)
    api_post "/api/v1/orders/#{o[:id]}/refunds", { amount_minor: 42_200, method_code: "cash", reason: "Full refund" }, headers: headers
    expect(json[:order][:status]).to eq("refunded")
    within(biz) { expect(PaymentAccount.find_by!(name: "Cash").current_balance_minor).to eq(0) }
    get "/api/v1/audit_logs?action_name=refund", headers: headers
    expect(json[:data].size).to eq(2)
  end

  it "refuses payment on a voided order and refuses to void a paid order" do
    o = new_order(extra: { place: true })
    api_post "/api/v1/orders/#{o[:id]}/void", { reason: "x" }, headers: headers
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
    expect(response).to have_http_status(:conflict)
    o2 = new_order(extra: { place: true })
    api_post "/api/v1/orders/#{o2[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
    api_post "/api/v1/orders/#{o2[:id]}/void", { reason: "x" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("order.paid")
  end

  it "reprints as DUPLICATE with an audit row and sends a digital receipt" do
    api_post "/api/v1/customers", { name: "Hafsa", phone: "03247932270" }, headers: headers
    o = new_order(extra: { customer_id: json[:id], place: true })
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
    get "/api/v1/orders/#{o[:id]}/receipt", headers: headers
    expect(json[:duplicate]).to be false
    expect(json[:totals][:tax_lines].first).to include(rate: 16.0, tax_minor: 1_280)
    api_post "/api/v1/orders/#{o[:id]}/receipt/reprint", {}, headers: auth_headers(cashier)
    expect(json[:duplicate]).to be true
    api_post "/api/v1/orders/#{o[:id]}/receipt/send", {}, headers: headers
    expect(json[:sent]).to be true
    expect(json[:to]).to eq("+923247932270")
    within(biz) { expect(ReceiptEvent.where(order_id: o[:id]).pluck(:kind)).to match_array(%w[reprint whatsapp]) }
  end

  it "transfers between accounts, adjusts with a note, and refuses to disable an account with a balance" do
    get "/api/v1/payment_accounts", headers: headers
    cash = json[:data].find { |a| a[:name] == "Cash" }[:id]
    bank = json[:data].find { |a| a[:name] == "Bank" }[:id]
    api_post "/api/v1/payment_accounts/#{cash}/adjust", { kind: "deposit", amount_minor: 100_000, note: "Opening float" }, headers: headers
    expect(json[:current_balance_minor]).to eq(100_000)
    api_post "/api/v1/payment_accounts/#{cash}/transfer", { to_account_id: bank, amount_minor: 60_000, note: "Bank deposit" }, headers: headers
    expect(json[:from][:current_balance_minor]).to eq(40_000)
    expect(json[:to][:current_balance_minor]).to eq(60_000)
    api_patch "/api/v1/payment_accounts/#{bank}", { active: false }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("account.has_balance")
    within(biz) do
      e = AccountEntry.first
      expect { e.update!(amount_minor: 1) }.to raise_error(ActiveRecord::ReadOnlyRecord)
      expect { e.destroy! }.to raise_error(ActiveRecord::ReadOnlyRecord)
    end
  end

  it "needs payments.take and isolates tenants" do
    waiter = add_member!(biz, "waiter")
    o = new_order(extra: { place: true })
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: auth_headers(waiter)
    expect(response).to have_http_status(:forbidden)
    other = signup_business(name: "Other")
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
    get "/api/v1/orders/#{o[:id]}/receipt", headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
  end
end

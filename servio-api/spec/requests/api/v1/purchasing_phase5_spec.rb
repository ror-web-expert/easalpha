require "rails_helper"

# SPEC "Purchasing, suppliers and expenses": supplier labels and counts, PO tiles and payment, the nine PO permissions,
# the Dr/Cr supplier ledger with tiles and manual adjustments, Supplier Insights ranking, Purchase Price History
# verdicts, and the expenses screen figures and export.
RSpec.describe "Purchasing phase 5", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:cashier) { add_member!(biz, "cashier") }

  def seed!
    within(biz) do
      Unit.seed_defaults!
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      g, kg, pcs = %w[g kg pcs].map { |c| Unit.find_by!(code: c) }
      chicken = StockItem.create!(name: "Chicken", sku: "CHK", base_unit: g, purchase_unit: kg)
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      { g: g, kg: kg, pcs: pcs, chicken: chicken, buns: buns }
    end
  end

  def grant!(codes)
    within(biz) { cashier.set_permissions!(codes) }
    auth_headers(cashier.reload)
  end

  it "labels supplier balances, counts items and purchases, shows PO tiles, pays a PO, and the ledger ties out with an adjustment" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Metro", opening_balance_minor: 10_000 }, headers: headers
    sup = json
    expect(sup).to include(balance_label: "to_pay", items_count: 0, purchases_count: 0)

    api_post "/api/v1/purchase_orders", { supplier_id: sup[:id], lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 10, unit_cost_minor: 50_000 }, { stock_item_id: s[:buns].id, quantity: 100, unit_cost_minor: 2_000 } ], send: true }, headers: headers
    po = json
    expect(po).to include(payment_status: "unpaid", paid_minor: 0, total_minor: 700_000)
    api_post "/api/v1/purchase_orders/#{po[:id]}/receive", {}, headers: headers
    expect(response).to have_http_status(:created)
    get "/api/v1/purchase_orders/summary", headers: headers
    expect(json).to include(total: 1, drafts: 0, received: 1, total_value_minor: 700_000)

    api_post "/api/v1/purchase_orders/#{po[:id]}/pay", { amount_minor: 300_000, method_code: "cash" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:purchase_order]).to include(paid_minor: 300_000, payment_status: "partial")
    expect(json[:payment][:purchase_order_label]).to eq("PO-1")
    get "/api/v1/purchase_orders?payment=partial", headers: headers
    expect(json[:data].size).to eq(1)

    get "/api/v1/suppliers", headers: headers
    row = json[:data].find { |x| x[:id] == sup[:id] }
    expect(row).to include(items_count: 2, purchases_count: 1, balance_label: "to_pay", balance_minor: 10_000 + 700_000 - 300_000)

    api_post "/api/v1/suppliers/#{sup[:id]}/adjust", { amount_minor: -5_000, reason: "Agreed discount" }, headers: headers
    expect(response).to have_http_status(:created)
    api_post "/api/v1/suppliers/#{sup[:id]}/adjust", { amount_minor: 0, reason: "x" }, headers: headers
    expect(response).to have_http_status(:bad_request)
    get "/api/v1/suppliers/#{sup[:id]}/ledger", headers: headers
    expect(json[:tiles]).to include(opening_minor: 10_000, purchases_minor: 700_000, payments_minor: 300_000, adjustments_minor: -5_000, balance_minor: 405_000, ties_out: true)
    types = json[:entries].map { |e| e[:type] }
    expect(types).to eq(%w[Opening Purchase Payment Adjustment])
    purchase = json[:entries].find { |e| e[:type] == "Purchase" }
    expect(purchase).to include(credit_minor: 700_000, debit_minor: 0, purchase_order_label: "PO-1")
    expect(json[:entries].find { |e| e[:type] == "Payment" }).to include(debit_minor: 300_000, purchase_order_label: "PO-1")
    expect(json[:entries].last[:balance_minor]).to eq(405_000)
    get "/api/v1/suppliers/#{sup[:id]}/adjustments", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/supplier_payments?method_code=cash", headers: headers
    expect(json[:data].size).to eq(1)
    expect(json[:data].first).to include(supplier_name: "Metro", purchase_order_label: "PO-1")
    expect(json[:totals]).to include(paid_minor: 300_000, count: 1)

    api_post "/api/v1/suppliers", { name: "Nobody", opening_balance_minor: -2_000 }, headers: headers
    expect(json[:balance_label]).to eq("to_receive")
    get "/api/v1/suppliers/ranking?sort=outstanding", headers: headers
    expect(json[:rows].first[:supplier][:name]).to eq("Metro")
    expect(json[:rows].first).to include(purchased_minor: 700_000, paid_minor: 300_000, outstanding_minor: 405_000, po_count: 1)
    expect(json[:rows].first[:last_purchase_on]).to eq(Date.current.iso8601)
    get "/api/v1/suppliers/ranking?sort=name", headers: headers
    expect(json[:rows].map { |r| r[:supplier][:name] }).to eq(%w[Metro Nobody])
  end

  it "gates each purchase order step by its own permission and allows inline supplier and item creation" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Metro" }, headers: headers
    sup = json[:id]
    ch = grant!(%w[PURCHASE_ORDERS PO_CREATE])
    api_post "/api/v1/purchase_orders", { supplier_id: sup, lines: [ { stock_item_id: s[:buns].id, quantity: 10, unit_cost_minor: 2_000 } ], send: true }, headers: ch
    expect(response).to have_http_status(:created)
    po = json[:id]
    api_post "/api/v1/purchase_orders/#{po}/receive", {}, headers: ch
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/purchase_orders/#{po}/pay", { amount_minor: 1_000, method_code: "cash" }, headers: ch
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/suppliers", { name: "Inline" }, headers: ch
    expect(response).to have_http_status(:forbidden)
    api_post "/api/v1/stock_items", { name: "Inline item", base_unit_id: s[:pcs].id }, headers: ch
    expect(response).to have_http_status(:forbidden)

    ch = grant!(%w[PURCHASE_ORDERS PO_CREATE PO_RECEIVE PO_PAYMENT PO_ADD_SUPPLIER PO_ADD_ITEM])
    api_post "/api/v1/suppliers", { name: "Inline" }, headers: ch
    expect(response).to have_http_status(:created)
    api_post "/api/v1/stock_items", { name: "Inline item", base_unit_id: s[:pcs].id }, headers: ch
    expect(response).to have_http_status(:created)
    api_post "/api/v1/purchase_orders/#{po}/receive", {}, headers: ch
    expect(response).to have_http_status(:created)
    api_post "/api/v1/purchase_orders/#{po}/pay", { amount_minor: 20_000, method_code: "cash" }, headers: ch
    expect(response).to have_http_status(:created)
    expect(json[:purchase_order][:payment_status]).to eq("paid")
    delete "/api/v1/purchase_orders/#{po}", headers: ch
    expect(response).to have_http_status(:forbidden) # no PO_DELETE
    get "/api/v1/suppliers/#{sup}/ledger", headers: ch
    expect(response).to have_http_status(:forbidden) # no SUPPLIER_LEDGER
  end

  it "flags a wrong unit on a purchase in Purchase Price History and reports expenses with average and export" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Metro" }, headers: headers
    sup = json[:id]
    # 10 kg at Rs 500/kg, then one line typed in grams at the kg price: 20x off.
    api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 10, unit_cost_minor: 50_000 } ] }, headers: headers
    api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:g].id, quantity: 1_000, unit_cost_minor: 50_000 } ] }, headers: headers
    api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: s[:buns].id, quantity: 100, unit_cost_minor: 2_000 } ] }, headers: headers
    get "/api/v1/purchasing/price_history", headers: headers
    expect(response).to have_http_status(:ok)
    rows = json[:rows].index_by { |r| r[:item][:name] }
    expect(rows["Chicken"]).to include(verdict: "wrong_unit", verdict_text: "Wrong unit on a purchase", flagged: true, purchases: 2)
    expect(rows["Chicken"][:last_price]).to include(unit_code: "g", unit_cost_minor: 50_000)
    expect(rows["Bun"]).to include(flagged: false, purchases: 1, spent_minor: 200_000)
    expect(json[:summary]).to include(items: 2, flagged: 1)
    get "/api/v1/purchasing/price_history?flagged=true", headers: headers
    expect(json[:rows].map { |r| r[:item][:name] }).to eq([ "Chicken" ])
    get "/api/v1/purchasing/price_history", headers: grant!(%w[SALES_WALKIN])
    expect(response).to have_http_status(:forbidden)

    within(biz) { ExpenseCategory.seed_defaults! }
    util = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
    gas = within(biz) { ExpenseCategory.find_by!(name: "Gas") }
    api_post "/api/v1/expenses", { category_id: gas.id, amount_minor: 30_000, method_code: "cash" }, headers: headers
    api_post "/api/v1/expenses", { category_id: util.id, amount_minor: 10_000, method_code: "bank", reference: "x" }, headers: headers
    get "/api/v1/expenses/summary", headers: headers
    expect(json).to include(total_minor: 40_000, count: 2, average_minor: 20_000, category_count: 1, subcategory_count: 2)
    get "/api/v1/expenses?method_code=bank", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/expenses?subcategory_id=#{gas.id}", headers: headers
    expect(json[:data].size).to eq(1)
    get "/api/v1/expenses/export", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.content_type).to include("text/csv")
    expect(response.body.lines.size).to eq(3)
    get "/api/v1/expenses/export", headers: grant!(%w[SALES_WALKIN])
    expect(response).to have_http_status(:forbidden)
  end
end

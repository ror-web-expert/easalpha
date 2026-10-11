require "rails_helper"

RSpec.describe "Suppliers and purchasing", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }

  def seed!
    within(biz) do
      Unit.seed_defaults!
      PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists?
      kitchen = StockSection.default_for(branch)
      g, kg, pcs = %w[g kg pcs].map { |c| Unit.find_by!(code: c) }
      chicken = StockItem.create!(name: "Chicken", sku: "CHK", base_unit: g, purchase_unit: kg, minimum_qty: 5000, reorder_qty: 10_000)
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs, minimum_qty: 50)
      { kitchen: kitchen, g: g, kg: kg, pcs: pcs, chicken: chicken, buns: buns }
    end
  end

  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity) }
  def balance(id) = within(biz) { Supplier.find(id).balance_minor }

  it "runs a purchase order from draft to received, tracks the supplier balance, price history and pays the supplier" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Metro Cash & Carry", phone: "0300 1234567", payment_terms_days: 15 }, headers: headers
    expect(response).to have_http_status(:created)
    sup = json[:id]
    expect(json[:phone]).to eq("+923001234567")
    api_post "/api/v1/suppliers", { name: "Metro Cash & Carry" }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)

    api_post "/api/v1/purchase_orders", { supplier_id: sup, expected_on: today_for(biz).to_s, lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 10, unit_cost_minor: 52_000 }, { stock_item_id: s[:buns].id, quantity: 200, unit_cost_minor: 2_200 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    po = json
    expect(po[:label]).to eq("PO-1")
    expect(po[:total_minor]).to eq(520_000 + 440_000)
    api_post "/api/v1/purchase_orders/#{po[:id]}/send", {}, headers: headers
    expect(json[:status]).to eq("sent")
    api_patch "/api/v1/purchase_orders/#{po[:id]}", { note: "x" }, headers: headers
    expect(response).to have_http_status(:conflict)

    chicken_line = po[:lines].find { |l| l[:item_name] == "Chicken" }
    api_post "/api/v1/purchase_orders/#{po[:id]}/receive", { invoice_ref: "INV-77", lines: [ { purchase_order_line_id: chicken_line[:id], quantity: 6, unit_cost_minor: 53_000 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:receipt][:label]).to eq("GRN-1")
    expect(json[:receipt][:total_minor]).to eq(318_000)
    expect(json[:purchase_order][:status]).to eq("partial")
    expect(level(s[:chicken])).to eq(6_000)
    expect(balance(sup)).to eq(318_000)
    expect(within(biz) { s[:chicken].reload.avg_cost_minor_per_base }).to eq(53)

    api_post "/api/v1/purchase_orders/#{po[:id]}/receive", {}, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:purchase_order][:status]).to eq("received")
    expect(json[:receipt][:line_count]).to eq(2)
    expect(level(s[:chicken])).to eq(10_000)
    expect(level(s[:buns])).to eq(200)
    expect(balance(sup)).to eq(318_000 + 208_000 + 440_000)
    get "/api/v1/purchasing/prices?stock_item_id=#{s[:chicken].id}", headers: headers
    expect(json[:data].map { |p| p[:unit_cost_minor] }).to contain_exactly(53_000, 52_000)

    api_post "/api/v1/suppliers/#{sup}/payments", { amount_minor: 500_000, method_code: "cash", reference: "slip 1" }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:payment][:label]).to eq("SP-1")
    expect(json[:supplier][:balance_minor]).to eq(466_000)
    cash = within(biz) { PaymentAccount.find_by!(kind: "cash") }
    expect(within(biz) { AccountEntry.where(payment_account_id: cash.id, kind: "supplier_payment").sum(:amount_minor) }).to eq(-500_000)
    get "/api/v1/suppliers/#{sup}/ledger", headers: headers
    expect(json[:entries].last[:balance_minor]).to eq(466_000)
    expect(json[:aging][:total]).to eq(466_000)
    get "/api/v1/purchasing/summary", headers: headers
    expect(json[:payables_minor]).to eq(466_000)
    get "/api/v1/purchasing/aging", headers: headers
    expect(json[:rows].size).to eq(1)
    get "/api/v1/suppliers/#{sup}/insights", headers: headers
    expect(json[:purchases_minor]).to eq(966_000)
    expect(json[:top_items].first[:item][:sku]).to eq("CHK")
    delete "/api/v1/suppliers/#{sup}", headers: headers
    expect(response).to have_http_status(:conflict)
  end

  it "receives without an order, returns goods as a credit note or cash refund, and cancels a receipt by reversal" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Local bakery" }, headers: headers
    sup = json[:id]
    api_post "/api/v1/goods_receipts", { supplier_id: sup, invoice_ref: "B-1", lines: [ { stock_item_id: s[:buns].id, quantity: 100, unit_cost_minor: 2_000 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    grn = json[:id]
    expect(level(s[:buns])).to eq(100)
    expect(balance(sup)).to eq(200_000)

    api_post "/api/v1/purchase_returns", { supplier_id: sup, goods_receipt_id: grn, reason: "Stale", settlement: "credit_note", lines: [ { stock_item_id: s[:buns].id, quantity: 10 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:label]).to eq("RET-1")
    expect(json[:amount_minor]).to eq(20_000)
    expect(level(s[:buns])).to eq(90)
    expect(balance(sup)).to eq(180_000)

    api_post "/api/v1/purchase_returns", { supplier_id: sup, goods_receipt_id: grn, reason: "Damaged", settlement: "cash_refund", method_code: "cash", lines: [ { stock_item_id: s[:buns].id, quantity: 5 } ] }, headers: headers
    expect(response).to have_http_status(:created)
    expect(level(s[:buns])).to eq(85)
    expect(balance(sup)).to eq(180_000)
    cash = within(biz) { PaymentAccount.find_by!(kind: "cash") }
    expect(within(biz) { AccountEntry.where(payment_account_id: cash.id, kind: "supplier_payment").sum(:amount_minor) }).to eq(10_000)

    api_post "/api/v1/goods_receipts/#{grn}/cancel", { reason: "Wrong invoice" }, headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json[:error][:code]).to eq("goods_receipt.returned")
    api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: s[:buns].id, quantity: 20, unit_cost_minor: 2_000 } ] }, headers: headers
    grn2 = json[:id]
    api_post "/api/v1/goods_receipts/#{grn2}/cancel", { reason: "Duplicate" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("cancelled")
    expect(level(s[:buns])).to eq(85)
    expect(balance(sup)).to eq(180_000)
    get "/api/v1/purchasing/report?group_by=item", headers: headers
    expect(json[:rows].first[:key]).to eq("Bun")
    expect(json[:total_minor]).to eq(200_000)
  end

  it "suggests reorders below minimum, forecasts from usage with a budget cap, and imports suppliers from CSV" do
    s = seed!
    api_post "/api/v1/suppliers", { name: "Farm" }, headers: headers
    sup = json[:id]
    api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [ { stock_item_id: s[:chicken].id, unit_id: s[:kg].id, quantity: 3, unit_cost_minor: 50_000 } ] }, headers: headers
    get "/api/v1/purchasing/suggestions", headers: headers
    row = json[:data].find { |r| r[:item][:sku] == "CHK" }
    expect(row[:suggested_qty]).to eq("10000.0")
    expect(row[:est_cost_minor]).to eq(500_000)
    expect(row[:supplier][:name]).to eq("Farm")
    expect(json[:data].map { |r| r[:item][:sku] }).to include("BUN")

    within(biz) do
      Stock::Ledger.apply!(section: s[:kitchen], item: s[:chicken], kind: "sale", quantity: -1_500, business_day: today_for(biz) - 1, allow_negative: true)
      Stock::Ledger.apply!(section: s[:kitchen], item: s[:chicken], kind: "sale", quantity: -1_500, business_day: today_for(biz), allow_negative: true)
    end
    get "/api/v1/purchasing/forecast?lookback_days=30&forecast_days=30&safety_percent=0", headers: headers
    row = json[:rows].first
    expect(row[:daily_usage]).to eq("100.0")
    expect(row[:on_hand]).to eq("0.0")
    expect(row[:order_qty]).to eq("3000.0")
    expect(row[:est_cost_minor]).to eq(150_000)
    get "/api/v1/purchasing/forecast?lookback_days=30&forecast_days=30&safety_percent=0&budget_minor=100000", headers: headers
    expect(json[:rows].first[:within_budget]).to be false
    expect(json[:within_budget_minor]).to eq(0)

    api_post "/api/v1/suppliers/import", { csv: "name,contact,phone,terms,opening_balance\nFarm,Ali,0301 1111111,7,0\nDairy Co,Sana,,30,1500.50\n" }, headers: headers
    expect(json).to eq({ created: 1, updated: 1 })
    get "/api/v1/suppliers?with_balance=true", headers: headers
    expect(json[:data].map { |x| x[:name] }).to eq([ "Dairy Co", "Farm" ])
    expect(json[:data].first[:balance_minor]).to eq(150_050)
  end

  it "isolates suppliers between businesses and needs the purchasing permission" do
    seed!
    api_post "/api/v1/suppliers", { name: "Only mine" }, headers: headers
    sid = json[:id]
    other = signup_business(name: "Other")
    get "/api/v1/suppliers/#{sid}", headers: auth_headers(other)
    expect(response).to have_http_status(:not_found)
    cashier = add_member!(biz, "cashier")
    api_post "/api/v1/suppliers", { name: "Nope" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end
end

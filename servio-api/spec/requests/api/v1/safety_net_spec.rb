require "rails_helper"

# SPEC: the safety net finds completed orders whose stock never moved and deducts them dated to the sale's day, never
# twice; Deduction Health shows the job, checks one order and retries; balance caches rebuild from their ledgers.
RSpec.describe "Safety net, deduction health and balance rebuild", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  def seed!
    within(biz) do
      Unit.seed_defaults!
      kitchen = StockSection.default_for(branch)
      pcs = Unit.find_by!(code: "pcs")
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: kitchen.id }, lines: [{ stock_item_id: buns.id, quantity: 100, unit_cost_minor: 2_500 }], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      buns
    end
  end
  def level(item) = within(biz) { StockLevel.where(stock_item_id: item.id).sum(:quantity) }

  def paid_order
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [{ product_id: m[:burger].id, quantity: 2 }], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [{ method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] }] }, headers: headers
    o
  end

  it "re-deducts a completed order whose deduction was lost, dated to the sale day, and never twice" do
    buns = seed!
    api_post "/api/v1/recipes", { product_id: m[:burger].id, name: "Burger", lines: [{ stock_item_id: buns.id, quantity: 1 }] }, headers: headers
    # A lost deduction: the order completes while deduction is off, then the setting comes back on.
    api_patch "/api/v1/inventory_settings", { deduct_stock_on_sale: false }, headers: headers
    o = paid_order
    expect(level(buns)).to eq(100)
    api_patch "/api/v1/inventory_settings", { deduct_stock_on_sale: true }, headers: headers
    within(biz) { Order.find(o[:id]).update_columns(stock_deducted_at: nil, business_day: Date.current - 2) }
    get "/api/v1/stock/deduction_health", headers: headers
    expect(json[:buckets][:pending]).to eq(1)
    expect(json[:safety_net][:last_run_at]).to be_nil
    api_post "/api/v1/stock/safety_net/run", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json).to include(checked: 1, deducted: 1, errors: 0)
    expect(level(buns)).to eq(98)
    within(biz) { expect(StockLedgerEntry.where(ref_table: "orders", ref_id: o[:id], kind: "sale").pluck(:business_day).uniq).to eq([Date.current - 2]) }
    api_post "/api/v1/stock/safety_net/run", {}, headers: headers
    expect(json).to include(checked: 0, deducted: 0)
    api_post "/api/v1/stock/deduction_health/#{o[:id]}/retry", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(level(buns)).to eq(98)
    expect(json[:movements].size).to eq(1)
    get "/api/v1/stock/deduction_health", headers: headers
    expect(json[:safety_net][:last_trigger]).to eq("manual")
    expect(json[:buckets][:pending]).to eq(0)
  end

  it "refuses a second identical sale movement at the database" do
    buns = seed!
    within(biz) do
      sec = StockSection.default_for(branch)
      o = Order.create!(branch: branch, order_type: "walk_in", status: "paid", business_day: Date.current)
      e = StockLedgerEntry.create!(branch: branch, stock_section: sec, stock_item: buns, kind: "sale", quantity: -1, before_qty: 100, after_qty: 99, ref_table: "orders", ref_id: o.id, business_day: Date.current, occurred_at: Time.current)
      dup = StockLedgerEntry.new(branch: branch, stock_section: sec, stock_item: buns, kind: "sale", quantity: -1, before_qty: 99, after_qty: 98, ref_table: "orders", ref_id: o.id, business_day: Date.current, occurred_at: Time.current)
      expect { dup.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
      expect(e).to be_persisted
    end
  end

  it "rebuilds cached stock levels and account balances from the ledgers" do
    buns = seed!
    within(biz) do
      StockLevel.update_all(quantity: 5)
      PaymentAccount.update_all(current_balance_minor: 999)
    end
    api_post "/api/v1/stock/rebuild_balances", {}, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:stock_levels]).to be >= 1
    expect(level(buns)).to eq(100)
    within(biz) { expect(PaymentAccount.sum(:current_balance_minor)).to eq(AccountEntry.sum(:amount_minor)) }
    cashier = add_member!(biz, "cashier")
    api_post "/api/v1/stock/rebuild_balances", {}, headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end
end

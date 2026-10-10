require "rails_helper"

RSpec.describe "Finance, Foodpanda and multi-branch", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def sell!(product, qty: 1, method: "cash")
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: product.id, quantity: qty } ], place: true }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: method, amount_minor: o[:total_minor] } ] }, headers: headers
    o
  end

  it "shows the day ledger, reconciles payments against postings, passes the integrity check, and builds a profit and loss with cost of goods" do
    m
    within(biz) do
      Unit.seed_defaults!
      pcs = Unit.find_by!(code: "pcs")
      buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: StockSection.default_for(branch).id }, lines: [ { stock_item_id: buns.id, quantity: 100, unit_cost_minor: 2_000 } ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      r = Recipe.create!(product: m[:burger], name: "Burger")
      r.lines.create!(stock_item: buns, unit: pcs, quantity: 1)
      Recipes::Costing.recompute!(r)
    end
    o1 = sell!(m[:burger], qty: 2)
    o2 = sell!(m[:chai], qty: 1)
    get "/api/v1/expenses/categories", headers: headers
    cat_id = json[:data].first[:id]
    api_post "/api/v1/expenses", { category_id: cat_id, amount_minor: 10_000, method_code: "cash" }, headers: headers
    day = branch.business_day_for(Time.current)

    get "/api/v1/finance/ledger?business_day=#{day}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:by_kind][:order_payment]).to eq(o1[:total_minor] + o2[:total_minor])
    expect(json[:by_kind][:expense]).to eq(-10_000)
    get "/api/v1/finance/reconciliation?business_day=#{day}", headers: headers
    expect(json[:balanced]).to be true
    expect(json[:posted_minor]).to eq(o1[:total_minor] + o2[:total_minor])
    get "/api/v1/finance/integrity?from=#{day}&to=#{day}", headers: headers
    expect(json[:ok]).to be true
    within(biz) { AccountEntry.where(ref_table: "payments").first.update_columns(ref_table: "payments_lost") }
    get "/api/v1/finance/integrity?from=#{day}&to=#{day}", headers: headers
    expect(json[:ok]).to be false
    expect(json[:issues].first[:kind]).to eq("payment_not_posted")

    get "/api/v1/finance/profit_loss?from=#{day}&to=#{day}", headers: headers
    pl = json
    expect(pl[:orders]).to eq(2)
    expect(pl[:revenue][:net_sales_minor]).to eq(90_000 + 8_000)
    expect(pl[:cost_of_goods_minor]).to eq(4_000)
    expect(pl[:gross_profit_minor]).to eq(94_000)
    expect(pl[:operating][:expenses_minor]).to eq(10_000)
    expect(pl[:net_profit_minor]).to eq(84_000)
    get "/api/v1/finance/export?from=#{day}&to=#{day}&format=quickbooks", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.body.lines.first).to start_with("Date,RefNumber,Account,Debit,Credit,Memo")
    expect(response.body).to include("Sales")
    get "/api/v1/finance/export?from=#{day}&to=#{day}&format=xero", headers: headers
    expect(response.body.lines.first).to start_with("*Date,*Description,*AccountCode")
  end

  it "ingests signed Foodpanda webhooks into delivery orders with commission, ignores replays, cancels, and reports" do
    m
    api_patch "/api/v1/integrations/foodpanda", { enabled: true, secret: "rotate", commission_percent: 25 }, headers: headers
    expect(response).to have_http_status(:ok)
    secret = json[:secret_plain]
    expect(secret).to be_present
    get "/api/v1/integrations/foodpanda", headers: headers
    expect(json[:webhook_url]).to eq("/api/v1/webhooks/foodpanda/#{biz.slug}")
    payload = { event: "order.new", order: { id: "FP-1001", customer: { name: "Zain", phone: "03004445566" }, address: { text: "House 5, Model Town" }, delivery_fee: 50,
                                              items: [ { sku: nil, name: "Zinger Burger", quantity: 2 }, { name: "Mystery combo", quantity: 1, price: 300 } ] } }.to_json
    sig = "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, payload)
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: payload, headers: { "Content-Type" => "application/json", "X-Signature" => "sha256=bad" }
    expect(response).to have_http_status(:unauthorized)
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: payload, headers: { "Content-Type" => "application/json", "X-Signature" => sig }
    expect(response).to have_http_status(:ok)
    ev = json
    expect(ev[:status]).to eq("processed")
    order_id = ev[:order_id]
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: payload, headers: { "Content-Type" => "application/json", "X-Signature" => sig }
    expect(json[:order_id]).to eq(order_id)
    expect(within(biz) { Order.where(source: "foodpanda").count }).to eq(1)
    get "/api/v1/orders/#{order_id}", headers: headers
    o = json
    expect(o[:source]).to eq("foodpanda")
    expect(o[:order_type]).to eq("delivery")
    expect(o[:status]).to eq("placed")
    expect(o[:items].map { |i| i[:name] }).to contain_exactly("Zinger Burger", "Mystery combo")
    expect(o[:delivery_charge_minor]).to eq(5_000)
    expect(within(biz) { Order.find(order_id).aggregator_commission_minor }).to eq((o[:total_minor] * 0.25).round)
    expect(within(biz) { Customer.find_by(phone: "+923004445566") }).to be_present
    api_post "/api/v1/orders/#{order_id}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers
    get "/api/v1/reports/foodpanda", headers: headers
    expect(json[:paid_orders]).to eq(1)
    expect(json[:commission_minor]).to eq((o[:total_minor] * 0.25).round)

    cancel = { event: "order.cancelled", order: { id: "FP-1001" } }.to_json
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: cancel, headers: { "Content-Type" => "application/json", "X-Signature" => "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, cancel) }
    expect(response).to have_http_status(:ok)
    payload2 = { event: "order.new", order: { id: "FP-1002", items: [ { name: "Chai", quantity: 1 } ] } }.to_json
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: payload2, headers: { "Content-Type" => "application/json", "X-Signature" => "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, payload2) }
    oid2 = json[:order_id]
    cancel2 = { event: "order.cancelled", order: { id: "FP-1002" } }.to_json
    post "/api/v1/webhooks/foodpanda/#{biz.slug}", params: cancel2, headers: { "Content-Type" => "application/json", "X-Signature" => "sha256=" + OpenSSL::HMAC.hexdigest("SHA256", secret, cancel2) }
    get "/api/v1/orders/#{oid2}", headers: headers
    expect(json[:status]).to eq("voided")
  end

  it "compares branches for a period" do
    m
    b2 = within(biz) { Branch.create!(name: "Gulberg", code: "GUL").id }
    sell!(m[:burger])
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers.merge("X-Branch-Id" => b2)
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }, headers: headers.merge("X-Branch-Id" => b2)
    get "/api/v1/reports/branches", headers: headers
    expect(json[:rows].size).to eq(2)
    main = json[:rows].find { |r| r[:branch][:is_main] }
    gul = json[:rows].find { |r| r[:branch][:id] == b2 }
    expect(main[:orders]).to eq(1)
    expect(gul[:revenue_minor]).to eq(o[:total_minor])
    expect(json[:total_orders]).to eq(2)
    expect(main[:share_percent] + gul[:share_percent]).to be_within(0.2).of(100)
  end
end

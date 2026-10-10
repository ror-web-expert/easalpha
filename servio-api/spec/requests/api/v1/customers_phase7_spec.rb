require "rails_helper"

# SPEC "Customers, credit, loyalty and feedback", Website Config and the report catalogue: Grand Report shares, Sales
# detail and calendar, Operations, regular discount tiers, voucher batches, loyalty redemption options, reviews,
# WhatsApp account notifications, customer insights and statements, website config and the storefront, AI insights.
RSpec.describe "Customers phase 7", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:cashier) { add_member!(biz, "cashier") }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def place!(product, customer_id: nil, extra: {})
    api_post "/api/v1/orders", { order_type: "takeaway", customer_id: customer_id, lines: [{ product_id: product.id, quantity: 1 }], place: true }.merge(extra), headers: headers
    json
  end

  def pay!(o, method: "cash", amount: nil)
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [{ method_code: method, amount_minor: amount || o[:total_minor], tendered_minor: amount || o[:total_minor] }] }, headers: headers
    json
  end

  describe "Grand Report and the catalogue" do
    it "shows every method with count and share, Unpaid and Complimentary shares, account receipts, the sales table, the calendar and operations" do
      m
      cust = within(biz) { Customer.create!(name: "Ali", phone: "+923001234567", credit_limit_minor: 10_000_000) }
      o1 = place!(m[:burger]); pay!(o1)
      o2 = place!(m[:burger]); pay!(o2, method: "card") if false
      api_post "/api/v1/orders/#{o2[:id]}/payments", { payments: [{ method_code: "card", amount_minor: o2[:total_minor], reference: "T1" }] }, headers: headers
      o3 = place!(m[:burger], customer_id: cust.id); pay!(o3, method: "khata")
      api_post "/api/v1/customers/#{cust.id}/payments", { amount_minor: 10_000, method_code: "cash" }, headers: headers
      expect(response).to have_http_status(:created)
      o4 = place!(m[:burger]) # stays unpaid
      place!(m[:burger], extra: { is_staff_meal: true, staff_meal_reason: "Owner lunch" })

      get "/api/v1/reports/grand_spec?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(response).to have_http_status(:ok)
      g = json
      sales = o1[:total_minor] + o2[:total_minor] + o3[:total_minor]
      expect(g[:sales_minor]).to eq(sales)
      methods = g[:methods].index_by { |r| r[:method] }
      expect(methods["cash"]).to include(count: 1, amount_minor: o1[:total_minor])
      expect(methods["card"]).to include(count: 1)
      expect(methods["khata"]).to include(count: 1)
      expect(g[:methods].sum { |r| r[:share_percent] }).to be_within(0.2).of(100.0) # the shares tie out to the period's sales
      expect(g[:unpaid]).to include(count: 1, amount_minor: o4[:total_minor])
      expect(g[:complimentary][:count]).to eq(1)
      expect(g[:account_receipts]).to include(count: 1, amount_minor: 10_000)
      expect(g[:on_account_minor]).to eq(o3[:total_minor])
      get "/api/v1/reports/grand?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:spec][:sales_minor]).to eq(sales)

      get "/api/v1/reports/sales?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:data].size).to eq(3)
      expect(json[:data].first).to include(:label, :order_type, :payment_status, :total_minor, :items)
      expect(json[:totals][:revenue_minor]).to eq(sales)
      get "/api/v1/reports/sales_calendar?month=#{Date.current.strftime('%Y-%m')}", headers: headers
      expect(json[:days].size).to eq(Date.current.end_of_month.day)
      expect(json[:totals][:revenue_minor]).to eq(sales)
      get "/api/v1/reports/operations?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json).to include(orders: 3, cancelled: 0)
      expect(json[:by_hour].size).to eq(24)
      get "/api/v1/reports/grand_spec", headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden).or have_http_status(:ok)
    end
  end

  describe "regular discounts and vouchers" do
    it "applies the smallest matching recency tier automatically, honours the blocked list, and redeems personal and public vouchers without the cashier limit" do
      m
      cust = within(biz) { Customer.create!(name: "Sara", phone: "+923009998877", last_order_at: 2.days.ago) }
      never = within(biz) { Customer.create!(name: "New", phone: "+923001110000") }
      api_post "/api/v1/regular_discount_tiers", { name: "Came back in a week", within_days: 7, kind: "percent", value: 10 }, headers: headers
      expect(response).to have_http_status(:created)
      api_post "/api/v1/regular_discount_tiers", { name: "Came back in a day", within_days: 3, kind: "percent", value: 20 }, headers: headers
      o = place!(m[:burger], customer_id: cust.id)
      reg = o[:discounts].find { |d| d[:kind] == "regular" }
      expect(reg).to be_present
      expect(reg[:reason]).to eq("Regular discount: Came back in a day") # the smallest window wins
      expect(reg[:amount_minor]).to eq((o[:subtotal_minor] * 0.20).round)
      o_new = place!(m[:burger], customer_id: never.id)
      expect(o_new[:discounts].none? { |d| d[:kind] == "regular" }).to be true # never ordered: nothing
      api_patch "/api/v1/settings", { values: { "marketing.regular_discounts.blocked_customer_ids" => [cust.id] } }, headers: headers
      o_blocked = place!(m[:burger], customer_id: cust.id)
      expect(o_blocked[:discounts].none? { |d| d[:kind] == "regular" }).to be true
      api_patch "/api/v1/settings", { values: { "marketing.regular_discounts.blocked_customer_ids" => [] } }, headers: headers
      get "/api/v1/reports/regular_discounts?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(response).to have_http_status(:ok)

      api_post "/api/v1/voucher_batches", { name: "Eid gift", kind: "personal", value_kind: "fixed", value: 200, min_spend_minor: 10_000, expires_on: (Date.current + 30).to_s }, headers: headers
      expect(response).to have_http_status(:created)
      batch = json
      api_post "/api/v1/voucher_batches/#{batch[:id]}/issue", { customer_ids: [cust.id, never.id], send: true }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:issued]).to eq(2)
      code = json[:data].find { |v| v[:customer_id] == cust.id }[:code]
      within(biz) { expect(WhatsappMessage.where(template_name: "voucher").count).to eq(2) }
      ch = within(biz) { cashier.set_permissions!(%w[SALES_TAKEAWAY SALES_WALKIN]); auth_headers(cashier.reload) }
      o2 = place!(m[:burger], customer_id: never.id)
      api_post "/api/v1/orders/#{o2[:id]}/discounts", { voucher_code: code }, headers: ch
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("voucher.customer")
      o3 = place!(m[:burger], customer_id: cust.id)
      api_post "/api/v1/orders/#{o3[:id]}/discounts", { voucher_code: code }, headers: ch # no discounts.apply, no limit check
      expect(response).to have_http_status(:ok)
      v = json[:discounts].find { |d| d[:kind] == "voucher" }
      expect(v[:amount_minor]).to eq(20_000)
      api_post "/api/v1/orders/#{o3[:id]}/discounts", { voucher_code: code }, headers: headers
      expect(json[:error][:code]).to eq("voucher.already")
      get "/api/v1/vouchers?code=#{code}", headers: headers
      expect(json[:data].first).to include(status: "redeemed", redeemed_order_id: o3[:id])

      api_post "/api/v1/voucher_batches", { name: "Social", kind: "public", public_code: "EID50", value_kind: "percent", value: 50, usage_limit: 1 }, headers: headers
      o4 = place!(m[:burger])
      api_post "/api/v1/orders/#{o4[:id]}/discounts", { voucher_code: "eid50" }, headers: headers
      expect(response).to have_http_status(:ok)
      o5 = place!(m[:burger])
      api_post "/api/v1/orders/#{o5[:id]}/discounts", { voucher_code: "EID50" }, headers: headers
      expect(json[:error][:code]).to eq("voucher.exhausted")
      pay!(o3); pay!(o4)
      get "/api/v1/reports/vouchers?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:totals][:redeemed]).to eq(2)
      api_post "/api/v1/voucher_batches", { name: "x", kind: "public", public_code: "Z", value: 1 }, headers: ch
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "loyalty options, reviews, WhatsApp, customers, website and AI" do
    it "redeems a loyalty option, records and filters reviews, sends statements with the master toggle, ranks customers, serves the storefront and stores AI insights" do
      m
      api_patch "/api/v1/loyalty/settings", { loyalty_enabled: true, loyalty_rupees_per_point: 1 }, headers: headers
      cust = within(biz) { Customer.create!(name: "Zara", phone: "+923005556666", loyalty_points: 500) }
      api_post "/api/v1/loyalty/redemption_options", { name: "Rs 100 off", points: 100, kind: "fixed", value: 100 }, headers: headers
      expect(response).to have_http_status(:created)
      opt = json
      o = place!(m[:burger], customer_id: cust.id)
      api_post "/api/v1/orders/#{o[:id]}/redeem_option", { option_id: opt[:id] }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:discounts].find { |d| d[:kind] == "loyalty" }[:amount_minor]).to eq(10_000)
      within(biz) { expect(cust.reload.loyalty_points).to eq(400) }
      pay!(json)
      get "/api/v1/reports/loyalty_points?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:redeemed]).to eq(100)
      expect(json[:issued]).to be > 0

      api_post "/api/v1/reviews", { order_id: o[:id], rating: 5, comment: "Great", source: "tablet" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(rating_word: "Excellent", source: "tablet")
      api_post "/api/v1/reviews", { order_id: o[:id], source: "website" }, headers: headers
      pending_id = json[:id]
      expect(json[:pending]).to be true
      get "/api/v1/reviews?pending=true", headers: headers
      expect(json[:data].size).to eq(1)
      patch "/api/v1/reviews/#{pending_id}/rate", params: { rating: 1 }.to_json, headers: headers.merge("CONTENT_TYPE" => "application/json")
      expect(json[:rating_word]).to eq("Poor")
      get "/api/v1/reviews/summary", headers: headers
      expect(json).to include(total: 2, rated: 2, pending: 0, average: 3.0, five_star: 1, one_star: 1)

      get "/api/v1/whatsapp/variables", headers: headers
      expect(json[:data]).to include("customer_name", "order_number", "order_total", "order_items", "discount", "service_charge", "loyalty_points", "previous_balance", "new_balance", "business_name")
      api_post "/api/v1/whatsapp/templates", { name: "account_statement", body: "Salam {customer_name}, balance Rs {new_balance} at {business_name}." }, headers: headers
      expect(response).to have_http_status(:created)
      api_post "/api/v1/customers/#{cust.id}/send_statement", {}, headers: headers
      expect(response).to have_http_status(:created)
      within(biz) { expect(WhatsappMessage.where(template_name: "account_statement").last.variables["text"]).to eq("Salam Zara, balance Rs 0 at #{biz.name}.") }
      api_post "/api/v1/whatsapp/bulk", { template: "account_statement", segment: "with_balance" }, headers: headers
      expect(json).to include(sent: 0)
      api_patch "/api/v1/settings", { values: { "whatsapp.account.master_enabled" => false } }, headers: headers
      api_post "/api/v1/whatsapp/send", { customer_id: cust.id, template: "account_statement" }, headers: headers
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("whatsapp.disabled")
      api_patch "/api/v1/settings", { values: { "whatsapp.account.master_enabled" => true } }, headers: headers

      get "/api/v1/customers/insights?sort=spent", headers: headers
      expect(json[:rows].first[:customer][:name]).to eq("Zara")
      expect(json[:totals]).to include(:by_status, :by_source)
      api_patch "/api/v1/customers/#{cust.id}", { status: "deactivated" }, headers: headers
      expect(json[:status]).to eq("deactivated")
      get "/api/v1/customer_payments", headers: headers
      expect(response).to have_http_status(:ok)

      get "/api/v1/website_config", headers: headers
      expect(json[:section_names]).to include("identity", "pages", "menu_slider", "documents", "footer", "availability", "signups", "location", "branches", "delivery", "pricing", "contact", "social", "whatsapp", "instagram", "seo", "mobile_app", "system")
      api_patch "/api/v1/website_config", { slug: "karachi-grill-test", published: true, sections: { identity: { theme_color: "#ff0000" }, delivery: { eta_minutes: 30 } } }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:sections][:identity][:theme_color]).to eq("#ff0000")
      expect(json[:sections][:identity][:name]).to eq(biz.name) # merged, not replaced
      api_patch "/api/v1/website_config", { sections: { bogus: {} } }, headers: headers
      expect(response).to have_http_status(:bad_request)
      get "/api/v1/public/storefront/karachi-grill-test"
      expect(response).to have_http_status(:ok)
      expect(json[:business][:name]).to eq(biz.name)
      expect(json[:products]).to be_an(Array)
      expect(json[:reviews][:summary][:total]).to eq(2)
      post "/api/v1/public/storefront/karachi-grill-test/reviews", params: { rating: 4, comment: "Nice site" }.to_json, headers: { "CONTENT_TYPE" => "application/json" }
      expect(response).to have_http_status(:created)
      get "/api/v1/public/storefront/nope"
      expect(response).to have_http_status(:not_found)

      get "/api/v1/reports/ai_pricing", headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:kind]).to eq("pricing")
      expect(json[:payload][:summary]).to include(:items_reviewed, :flagged)
      get "/api/v1/reports/ai_stock_forecast", headers: headers
      expect(json[:kind]).to eq("stock_forecast")
      within(biz) { expect(AiInsight.count).to eq(2) }
    end
  end
end

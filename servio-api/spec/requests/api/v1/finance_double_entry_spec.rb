require "rails_helper"

# SPEC "Payments, charges, tax and the finance ledger": the wallet catalogue, Finance Dashboard, charges as percent or
# fixed, tax per account, and double entry: chart of accounts, journal voucher, trial balance, balance sheet, fixed assets.
RSpec.describe "Finance double entry", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:m) { build_menu!(biz) }
  let(:cashier) { add_member!(biz, "cashier") }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def sell!(product, method: "cash", order_type: "takeaway", extra: {})
    api_post "/api/v1/orders", { order_type: order_type, lines: [{ product_id: product.id, quantity: 1 }], place: true }.merge(extra), headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [{ method_code: method, amount_minor: o[:total_minor], tendered_minor: o[:total_minor] }] }, headers: headers
    o
  end

  def balance(code) = within(biz) { Finance::Statements.balances(as_of: Date.current)[GlAccount.find_by!(code: code).id] }
  # Every payment account posts to its own child account under Cash in Hand, Cash at Bank or Mobile Wallets.
  def mirror_balance(account_name) = within(biz) { Finance::Statements.balances(as_of: Date.current)[GlAccount.find_by!(payment_account_id: PaymentAccount.find_by!(name: account_name).id).id] }

  describe "chart of accounts" do
    it "ships seeded and numbered with system rows protected, lets users extend it, and refuses a header on a voucher" do
      get "/api/v1/finance/accounts", headers: headers
      codes = json[:data].map { |a| a[:code] }
      expect(codes).to include("1000", "1010", "1020", "1030", "1100", "1200", "1300", "1500", "1590", "2000", "2010", "3010", "4000", "5000")
      cash = json[:data].find { |a| a[:code] == "1010" }
      expect(cash).to include(is_system: true, kind: "asset", normal_side: "debit")
      api_patch "/api/v1/finance/accounts/#{cash[:id]}", { code: "9999" }, headers: headers
      get "/api/v1/finance/accounts/#{cash[:id]}", headers: headers
      expect(json[:code]).to eq("1010")
      delete "/api/v1/finance/accounts/#{cash[:id]}", headers: headers
      expect(response).to have_http_status(:conflict)
      api_post "/api/v1/finance/accounts", { code: "5170", name: "Staff meals", kind: "expense", parent_id: json[:id] }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(code: "5170", is_system: false, normal_side: "debit")
      api_post "/api/v1/finance/journal", { description: "bad", lines: [{ code: "1000", debit_minor: 100 }, { code: "4000", credit_minor: 100 }] }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("journal.header")
    end
  end

  describe "automatic journal lines" do
    it "books a cash sale, an expense and a transfer, and the trial balance and balance sheet tie out" do
      sell!(m[:burger])
      within(biz) { ExpenseCategory.seed_defaults! }
      cat = within(biz) { ExpenseCategory.find_by!(name: "Utilities") }
      api_post "/api/v1/expenses", { category_id: cat.id, amount_minor: 5_000, method_code: "cash", paid_to: "K-Electric" }, headers: headers
      expect(response).to have_http_status(:created)
      get "/api/v1/payment_accounts", headers: headers
      cash = json[:data].find { |a| a[:name] == "Cash" }
      bank = json[:data].find { |a| a[:name] == "Bank" }
      api_post "/api/v1/payment_accounts/#{cash[:id]}/transfer", { to_account_id: bank[:id], amount_minor: 3_000, note: "deposit" }, headers: headers
      expect(response).to have_http_status(:ok)

      get "/api/v1/finance/journal", headers: headers
      kinds = json[:data].map { |e| e[:description] }
      expect(kinds.grep(/Order/).size).to eq(1)
      expect(kinds.grep(/Utilities/).size).to eq(1)
      expect(kinds.grep(/Transfer Cash to Bank/).size).to eq(1)
      expect(json[:data].all? { |e| e[:lines].sum { |l| l[:debit_minor] } == e[:lines].sum { |l| l[:credit_minor] } }).to be true

      total = within(biz) { Order.where(status: %w[paid closed]).sum(:total_minor) }
      expect(balance("4000")).to eq(total)
      expect(balance("5130")).to eq(5_000)
      expect(mirror_balance("Bank")).to eq(3_000)
      expect(mirror_balance("Cash")).to eq(total - 5_000 - 3_000)
      get "/api/v1/finance/accounts", headers: headers
      expect(json[:data].find { |a| a[:code] == "1000" }[:rollup_minor]).to eq(total - 5_000) # header totals everything beneath it

      get "/api/v1/finance/trial_balance?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:balanced]).to be true
      expect(json[:totals][:debit_minor]).to eq(json[:totals][:credit_minor])
      get "/api/v1/finance/balance_sheet", headers: headers
      expect(json[:balanced]).to be true
      expect(json[:current_earnings_minor]).to eq(total - 5_000)
      expect(json[:total_assets_minor]).to eq(total - 5_000)
      get "/api/v1/finance/liabilities", headers: headers
      expect(json[:total_minor]).to eq(0)
      get "/api/v1/finance/equity", headers: headers
      expect(json[:total_with_earnings_minor]).to eq(total - 5_000)
      get "/api/v1/finance/accounts/#{within(biz) { GlAccount.find_by!(code: '4000').id }}/ledger?from=#{Date.current - 1}&to=#{Date.current}", headers: headers
      expect(json[:rows].size).to eq(1)
      expect(json[:closing_minor]).to eq(total)
    end

    it "books goods received to inventory and payables, supplier payments against payables, and cost of goods on the sale" do
      within(biz) do
        Unit.seed_defaults!
        pcs = Unit.find_by!(code: "pcs")
        buns = StockItem.create!(name: "Bun", sku: "BUN", base_unit: pcs)
        r = Recipe.create!(product: m[:burger], name: "Burger")
        r.lines.create!(stock_item: buns, unit: pcs, quantity: 1)
        Recipes::Costing.recompute!(r)
        @buns = buns
      end
      api_post "/api/v1/suppliers", { name: "Dawn Bread" }, headers: headers
      sup = json[:id]
      api_post "/api/v1/goods_receipts", { supplier_id: sup, lines: [{ stock_item_id: @buns.id, quantity: 100, unit_cost_minor: 2_000 }] }, headers: headers
      expect(response).to have_http_status(:created)
      expect(balance("1200")).to eq(200_000)
      expect(balance("2010")).to eq(200_000)
      api_post "/api/v1/suppliers/#{sup}/payments", { amount_minor: 50_000, method_code: "cash" }, headers: headers
      expect(balance("2010")).to eq(150_000)
      sell!(m[:burger])
      expect(balance("5000")).to eq(2_000)
      expect(balance("1200")).to eq(198_000)
      get "/api/v1/finance/balance_sheet", headers: headers
      expect(json[:balanced]).to be true
    end
  end

  describe "journal voucher" do
    it "posts a balanced manual voucher, numbers it, rejects an unbalanced one and a cashier, and reverses" do
      api_post "/api/v1/finance/journal", { description: "Owner puts in cash", lines: [{ code: "1010", debit_minor: 100_000 }, { code: "3010", credit_minor: 90_000 }] }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("journal.unbalanced")
      api_post "/api/v1/finance/journal", { description: "Owner puts in cash", lines: [{ code: "1010", debit_minor: 100_000 }, { code: "3010", credit_minor: 100_000 }] }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:label]).to match(/\AJV-\d{6}\z/)
      expect(json[:kind]).to eq("manual")
      jv = json
      api_post "/api/v1/finance/journal", { description: "x", lines: [] }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
      expect(balance("3010")).to eq(100_000)
      api_post "/api/v1/finance/journal/#{jv[:id]}/reverse", { reason: "typo" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:kind]).to eq("reversal")
      expect(balance("3010")).to eq(0)
      api_post "/api/v1/finance/journal/#{jv[:id]}/reverse", {}, headers: headers
      expect(response).to have_http_status(:conflict)
      within(biz) { expect(AuditLog.where(table_name: "journal_entries").count).to be >= 1 }
    end
  end

  describe "fixed assets" do
    it "registers an asset against capital, depreciates straight-line by month, and disposes" do
      equipment = within(biz) { GlAccount.find_by!(code: "1510") }
      api_post "/api/v1/finance/fixed_assets", { name: "Deck oven", gl_account_id: equipment.id, cost_minor: 1_200_000, salvage_minor: 0, purchased_on: (Date.current - 100).to_s, useful_life_months: 60, paid_from: "capital" }, headers: headers
      expect(response).to have_http_status(:created)
      asset = json
      expect(asset[:monthly_minor]).to eq(20_000)
      expect(balance("1510")).to eq(1_200_000)
      api_post "/api/v1/finance/fixed_assets/#{asset[:id]}/depreciate", {}, headers: headers
      expect(json[:accumulated_minor]).to eq(60_000)
      expect(json[:book_value_minor]).to eq(1_140_000)
      expect(balance("1590")).to eq(60_000)
      expect(balance("5900")).to eq(60_000)
      api_post "/api/v1/finance/fixed_assets/#{asset[:id]}/depreciate", {}, headers: headers
      expect(json[:accumulated_minor]).to eq(60_000) # nothing new this month
      get "/api/v1/finance/balance_sheet", headers: headers
      expect(json[:balanced]).to be true
      api_post "/api/v1/finance/fixed_assets/#{asset[:id]}/dispose", {}, headers: headers
      expect(json[:status]).to eq("disposed")
      expect(balance("1510")).to eq(0)
      expect(balance("5190")).to eq(1_140_000)
      api_post "/api/v1/finance/fixed_assets", { name: "x", gl_account_id: equipment.id, cost_minor: 1, useful_life_months: 1 }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "dashboard, catalogue, tax per account and charges" do
    it "shows totals and counts by source, adds a wallet from the catalogue with its account, and bumps the settings version" do
      sell!(m[:burger])
      get "/api/v1/finance/dashboard", headers: headers
      expect(json[:total_balance_minor]).to be > 0
      expect(json[:today_in_minor]).to eq(json[:total_balance_minor])
      expect(json[:counts]).to include(orders: 1, expenses: 0, supplier_payments: 0, transfers: 0)
      expect(json[:recent].first).to include(:balance_after_minor)

      get "/api/v1/payment_methods/catalogue", headers: headers
      expect(json[:data].map { |c| c[:name] }).to include("uPaisa", "SadaPay", "NayaPay", "HBL Pay", "UBL Omni", "MCB", "Allied Bank", "NBP", "Bank AL Habib", "Soneri Bank", "Dubai Islamic Bank")
      v0 = within(biz) { biz.reload.settings_version }
      api_post "/api/v1/payment_methods", { catalogue_code: "sadapay" }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json).to include(code: "sadapay", kind: "wallet", catalogue_code: "sadapay")
      expect(json[:payment_account_id]).to be_present
      within(biz) do
        expect(PaymentAccount.find(json[:payment_account_id])).to have_attributes(name: "SadaPay", kind: "wallet")
        expect(GlAccount.find_by(payment_account_id: json[:payment_account_id]).code).to start_with("1040.")
        expect(biz.reload.settings_version).to eq(v0 + 1)
      end
      get "/api/v1/payment_methods/catalogue", headers: headers
      expect(json[:data].find { |c| c[:code] == "sadapay" }[:added]).to be true
      api_post "/api/v1/payment_methods", { catalogue_code: "nayapay" }, headers: auth_headers(cashier)
      expect(response).to have_http_status(:forbidden)
    end

    it "links a tax rate to an account and lets the order choose No Tax or the rate; charges pre-fill as percent or fixed" do
      m
      get "/api/v1/payment_accounts", headers: headers
      cash = json[:data].find { |a| a[:name] == "Cash" }
      api_post "/api/v1/tax_rates", { name: "Cash 16%", rate: 16, authority: "pra", payment_account_id: cash[:id] }, headers: headers
      expect(response).to have_http_status(:created)
      expect(json[:payment_account_id]).to eq(cash[:id])
      rate_id = json[:id]
      api_post "/api/v1/orders", { order_type: "takeaway", lines: [{ product_id: m[:burger].id, quantity: 1 }], place: true }, headers: headers
      o = json
      expect(o[:tax_minor]).to be > 0
      api_post "/api/v1/orders/#{o[:id]}/tax_choice", { none: true }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json[:tax_minor]).to eq(0)
      expect(json[:tax_choice]).to eq("none")
      api_post "/api/v1/orders/#{o[:id]}/tax_choice", { tax_rate_id: rate_id }, headers: headers
      expect(json[:tax_minor]).to eq(o[:tax_minor])
      expect(json[:tax_rate_id]).to eq(rate_id)

      api_patch "/api/v1/settings", { values: { "charges.service_charge.mode" => "fixed", "charges.service_charge.value" => 150, "charges.service_charge.order_types" => %w[dine_in],
                                                "charges.delivery_charge.mode" => "percent", "charges.delivery_charge.value" => 10 } }, headers: headers
      expect(response).to have_http_status(:ok)
      api_post "/api/v1/orders", { order_type: "dine_in", lines: [{ product_id: m[:burger].id, quantity: 1 }] }, headers: headers
      expect(json[:service_charge_minor]).to eq(15_000)
      expect(json[:service_charge_fixed_minor]).to eq(15_000)
      api_patch "/api/v1/orders/#{json[:id]}", { service_charge_fixed_minor: 0, service_charge_percent: 0 }, headers: headers
      expect(json[:service_charge_minor]).to eq(0) # the cashier removed it
      api_post "/api/v1/orders", { order_type: "delivery", lines: [{ product_id: m[:burger].id, quantity: 1 }] }, headers: headers
      net = json[:subtotal_minor] - json[:discount_minor]
      expect(json[:delivery_charge_percent]).to eq(10.0)
      expect(json[:delivery_charge_minor]).to eq((net * 0.10).round)
      api_post "/api/v1/orders", { order_type: "delivery", delivery_charge_minor: 5_000, delivery_charge_percent: 0, lines: [{ product_id: m[:burger].id, quantity: 1 }] }, headers: headers
      expect(json[:delivery_charge_minor]).to eq(5_000)
    end
  end
end

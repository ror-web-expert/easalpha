module Finance
  # SPEC double entry: the system chart of accounts every business ships with. Codes, kinds and normal sides follow the
  # SPEC list (1000 Current Assets, 1010 Cash in Hand ... 1590 Accumulated Depreciation, 2000 Current Liabilities and
  # so on). System rows are protected; users add their own beneath them. Every payment account gets a child account.
  module Chart
    module_function

    # code, name, kind, header?, parent code, normal side override
    CHART = [
      [ "1000", "Current Assets", "asset", true, nil ],
      [ "1010", "Cash in Hand", "asset", false, "1000" ],
      [ "1020", "Cash at Bank", "asset", false, "1000" ],
      [ "1030", "Petty Cash", "asset", false, "1000" ],
      [ "1040", "Mobile Wallets", "asset", false, "1000" ],
      [ "1100", "Accounts Receivable", "asset", false, "1000" ],
      [ "1200", "Inventory", "asset", false, "1000" ],
      [ "1300", "Prepaid Expenses", "asset", false, "1000" ],
      [ "1500", "Fixed Assets", "asset", true, nil ],
      [ "1510", "Equipment", "asset", false, "1500" ],
      [ "1520", "Furniture and Fixtures", "asset", false, "1500" ],
      [ "1530", "Vehicles", "asset", false, "1500" ],
      [ "1540", "Buildings and Improvements", "asset", false, "1500" ],
      [ "1590", "Accumulated Depreciation", "asset", false, "1500", "credit" ],
      [ "2000", "Current Liabilities", "liability", true, nil ],
      [ "2010", "Accounts Payable", "liability", false, "2000" ],
      [ "2100", "Tax Payable", "liability", false, "2000" ],
      [ "2200", "Accrued Salaries", "liability", false, "2000" ],
      [ "2300", "Customer Deposits", "liability", false, "2000" ],
      [ "2500", "Long-term Liabilities", "liability", true, nil ],
      [ "2510", "Loans Payable", "liability", false, "2500" ],
      [ "3000", "Equity", "equity", true, nil ],
      [ "3010", "Owner's Capital", "equity", false, "3000" ],
      [ "3020", "Owner's Drawings", "equity", false, "3000", "debit" ],
      [ "3900", "Retained Earnings", "equity", false, "3000" ],
      [ "4000", "Sales Revenue", "income", false, nil ],
      [ "4010", "Service Charges", "income", false, nil ],
      [ "4020", "Delivery Charges", "income", false, nil ],
      [ "4100", "Other Income", "income", false, nil ],
      [ "4900", "Sales Discounts", "income", false, nil, "debit" ],
      [ "5000", "Cost of Goods Sold", "expense", false, nil ],
      [ "5100", "Operating Expenses", "expense", true, nil ],
      [ "5110", "Salaries and Wages", "expense", false, "5100" ],
      [ "5120", "Rent", "expense", false, "5100" ],
      [ "5130", "Utilities", "expense", false, "5100" ],
      [ "5140", "Marketing", "expense", false, "5100" ],
      [ "5150", "Repairs and Maintenance", "expense", false, "5100" ],
      [ "5160", "Transport and Fuel", "expense", false, "5100" ],
      [ "5190", "Other Expenses", "expense", false, "5100" ],
      [ "5200", "Waste and Spoilage", "expense", false, nil ],
      [ "5300", "Rider Commissions", "expense", false, nil ],
      [ "5900", "Depreciation Expense", "expense", false, nil ]
    ].freeze

    PAYMENT_PARENTS = { "cash" => "1010", "drawer" => "1010", "bank" => "1020", "wallet" => "1040", "custom" => "1020" }.freeze
    EXPENSE_PARENTS = { "Salaries" => "5110", "Rent" => "5120", "Utilities" => "5130", "Marketing" => "5140", "Kitchen" => "5150", "Transport" => "5160", "Petty cash" => "5190" }.freeze

    def seed!
      by_code = GlAccount.unscope(where: :archived_at).index_by(&:code)
      CHART.each do |code, name, kind, header, parent_code, side|
        next if by_code[code]
        by_code[code] = GlAccount.create!(code: code, name: name, kind: kind, is_header: header, parent: parent_code && by_code[parent_code], normal_side: side || default_side(kind), is_system: true)
      end
      by_code
    end

    def default_side(kind) = %w[asset expense].include?(kind) ? "debit" : "credit"

    def account(code)
      GlAccount.find_by(code: code) || seed![code] or raise Api::Errors::NotFound.new("gl_account.unknown", "No account #{code}")
    end

    # The ledger account that mirrors a payment account, created under Cash in Hand, Cash at Bank or Mobile Wallets.
    def for_payment_account(pa)
      GlAccount.find_by(payment_account_id: pa.id) || begin
        parent = account(PAYMENT_PARENTS.fetch(pa.kind, "1020"))
        n = GlAccount.unscope(where: :archived_at).where(parent_id: parent.id).count + 1
        GlAccount.create!(code: format("%s.%02d", parent.code, n), name: pa.name, kind: "asset", normal_side: "debit", parent: parent, payment_account: pa, is_system: true)
      end
    end

    def for_expense_category(category)
      root = category.parent || category
      account(EXPENSE_PARENTS.fetch(root.name, "5190"))
    end
  end
end

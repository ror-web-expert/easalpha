module Balances
  # SPEC: balance caches on stock, accounts, customers and suppliers are derived values with a rebuild task, never the
  # source of truth. Each part recomputes the cache from its append-only ledger.
  module Rebuild
    module_function

    def all!
      { stock_levels: stock_levels!, payment_accounts: payment_accounts!, customers: customers!, suppliers: suppliers! }
    end

    # stock_levels = sum of ledger quantities per section and item; value from the latest after-state cost.
    def stock_levels!
      sums = StockLedgerEntry.group(:stock_section_id, :stock_item_id).pluck(:stock_section_id, :stock_item_id, Arel.sql("SUM(quantity)"), Arel.sql("SUM(value_minor)"))
      touched = 0
      sums.each do |section_id, item_id, qty, value|
        level = StockLevel.find_or_initialize_by(stock_section_id: section_id, stock_item_id: item_id)
        next if level.persisted? && level.quantity == qty && level.value_minor == value.to_i
        level.update!(quantity: qty, value_minor: value.to_i)
        touched += 1
      end
      touched
    end

    # payment_accounts.current_balance_minor = sum of account entries.
    def payment_accounts!
      sums = AccountEntry.group(:payment_account_id).sum(:amount_minor)
      touched = 0
      PaymentAccount.find_each do |a|
        bal = sums[a.id].to_i
        next if a.current_balance_minor == bal
        PaymentAccount.where(id: a.id).update_all(current_balance_minor: bal)
        touched += 1
      end
      touched
    end

    # customers.balance_minor = khata charges minus payments received plus payments made to the customer.
    def customers!
      touched = 0
      Customer.find_each do |c|
        bal = Customers::Ledger.entries(c).last&.dig(:balance_minor) || 0
        next if bal.nil? || c.balance_minor == bal
        Customer.where(id: c.id).update_all(balance_minor: bal)
        touched += 1
      end
      touched
    end

    def suppliers!
      touched = 0
      Supplier.find_each do |s|
        bal = Suppliers::Ledger.entries(s).last&.dig(:balance_minor) || 0
        next if bal.nil? || s.balance_minor == bal
        Supplier.where(id: s.id).update_all(balance_minor: bal)
        touched += 1
      end
      touched
    end
  end
end

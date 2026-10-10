module Finance
  # SPEC finance statements: Dashboard, Trial Balance, Balance Sheet, Liabilities, Equity and one account's ledger.
  module Statements
    module_function

    # SPEC Finance Dashboard: total balance across accounts, Today In and Today Out, counts of the four movement
    # sources (orders, expenses, supplier payments, transfers) and recent activity with the balance after each line.
    def dashboard(branch:, day: nil)
      day ||= branch.business_day_for(Time.current)
      accounts = PaymentAccount.active.company.to_a
      today = AccountEntry.where(payment_account_id: accounts.map(&:id), business_day: day)
      sources = { orders: %w[order_payment refund], expenses: %w[expense], supplier_payments: %w[supplier_payment], transfers: %w[transfer_in transfer_out] }
      counts = sources.transform_values { |kinds| today.where(kind: kinds).count }
      recent = AccountEntry.where(payment_account_id: accounts.map(&:id)).includes(:payment_account).order(occurred_at: :desc, created_at: :desc).limit(25).to_a
      running = accounts.index_with(&:current_balance_minor).transform_keys(&:id)
      rows = recent.map do |e|
        after = running[e.payment_account_id]
        running[e.payment_account_id] = after - e.amount_minor
        { id: e.id, at: e.occurred_at, business_day: e.business_day, account: e.payment_account.name, kind: e.kind, amount_minor: e.amount_minor, description: e.description, balance_after_minor: after }
      end
      { business_day: day, total_balance_minor: accounts.sum(&:current_balance_minor), today_in_minor: today.where("amount_minor > 0").sum(:amount_minor), today_out_minor: -today.where("amount_minor < 0").sum(:amount_minor),
        counts: counts, accounts: accounts.map { |a| { id: a.id, name: a.name, kind: a.kind, balance_minor: a.current_balance_minor } }, recent: rows }
    end

    # Debit and credit movement per account inside the window, with the opening balance carried in.
    def trial_balance(from:, to:)
      accounts = GlAccount.active.order(:code).to_a
      before = movements(..(from - 1))
      inside = movements(from..to)
      rows = accounts.reject(&:is_header).map do |a|
        ob = a.opening_balance_minor + (a.normal_side == "debit" ? 1 : -1) * 0
        open_d, open_c = before[a.id] || [ 0, 0 ]
        opening = (a.normal_side == "debit" ? ob : -ob) + open_d - open_c # positive = debit balance
        d, c = inside[a.id] || [ 0, 0 ]
        closing = opening + d - c
        { account: FinanceSerializers.gl_account(a), opening_debit_minor: [ opening, 0 ].max, opening_credit_minor: [ -opening, 0 ].max, debit_minor: d, credit_minor: c,
          closing_debit_minor: [ closing, 0 ].max, closing_credit_minor: [ -closing, 0 ].max }
      end.reject { |r| r.values_at(:opening_debit_minor, :opening_credit_minor, :debit_minor, :credit_minor).all?(&:zero?) }
      totals = %i[opening_debit_minor opening_credit_minor debit_minor credit_minor closing_debit_minor closing_credit_minor].index_with { |k| rows.sum { |r| r[k] } }
      { from: from, to: to, rows: rows, totals: totals, balanced: totals[:debit_minor] == totals[:credit_minor] }
    end

    # Assets equal liabilities plus equity, with the period's profit carried into equity as current earnings.
    def balance_sheet(as_of:)
      bal = balances(as_of: as_of)
      accounts = GlAccount.active.order(:code).to_a
      section = ->(kind) { accounts.select { |a| a.kind == kind && !a.is_header }.map { |a| { account: FinanceSerializers.gl_account(a), balance_minor: natural(a, bal[a.id] || 0) } }.reject { |r| r[:balance_minor].zero? } }
      assets, liabilities, equity = section.call("asset"), section.call("liability"), section.call("equity")
      income = accounts.select { |a| a.kind == "income" }.sum { |a| natural(a, bal[a.id] || 0) }
      expenses = accounts.select { |a| a.kind == "expense" }.sum { |a| natural(a, bal[a.id] || 0) }
      earnings = income - expenses
      total_assets = assets.sum { |r| r[:balance_minor] }
      total_liabilities = liabilities.sum { |r| r[:balance_minor] }
      total_equity = equity.sum { |r| r[:balance_minor] } + earnings
      { as_of: as_of, assets: assets, liabilities: liabilities, equity: equity, current_earnings_minor: earnings, income_minor: income, expenses_minor: expenses,
        total_assets_minor: total_assets, total_liabilities_minor: total_liabilities, total_equity_minor: total_equity, balanced: total_assets == total_liabilities + total_equity }
    end

    def liabilities(as_of:) = kind_list("liability", as_of: as_of)
    def equity(as_of:)
      list = kind_list("equity", as_of: as_of)
      sheet = balance_sheet(as_of: as_of)
      list.merge(current_earnings_minor: sheet[:current_earnings_minor], total_with_earnings_minor: list[:total_minor] + sheet[:current_earnings_minor])
    end

    def kind_list(kind, as_of:)
      bal = balances(as_of: as_of)
      rows = GlAccount.active.where(kind: kind, is_header: false).order(:code).map { |a| { account: FinanceSerializers.gl_account(a), balance_minor: natural(a, bal[a.id] || 0) } }
      { as_of: as_of, rows: rows, total_minor: rows.sum { |r| r[:balance_minor] } }
    end

    # A balance expressed on its section's side, so a contra account (Accumulated Depreciation, Owner's Drawings,
    # Sales Discounts) counts against the section it sits in.
    def natural(account, balance)
      side = %w[asset expense].include?(account.kind) ? "debit" : "credit"
      account.normal_side == side ? balance : -balance
    end

    # Balance on the normal side per account as of a day, opening balance included.
    def balances(as_of:)
      mv = movements(..as_of)
      GlAccount.active.to_a.to_h do |a|
        d, c = mv[a.id] || [ 0, 0 ]
        [ a.id, a.opening_balance_minor + GlAccount.signed(a.normal_side, d, c) ]
      end
    end

    def movements(range)
      JournalLine.joins(:journal_entry).where(journal_entries: { business_day: range }).group(:gl_account_id).pluck(:gl_account_id, Arel.sql("SUM(debit_minor)"), Arel.sql("SUM(credit_minor)"))
                 .to_h { |id, d, c| [ id, [ d.to_i, c.to_i ] ] }
    end

    def account_ledger(account, from:, to:)
      opening = account.opening_balance_minor + GlAccount.signed(account.normal_side, *(movements(..(from - 1))[account.id] || [ 0, 0 ]))
      lines = JournalLine.joins(:journal_entry).where(gl_account_id: account.id, journal_entries: { business_day: from..to }).includes(:journal_entry).order("journal_entries.business_day, journal_entries.number")
      balance = opening
      rows = lines.map do |l|
        balance += GlAccount.signed(account.normal_side, l.debit_minor, l.credit_minor)
        { id: l.id, business_day: l.journal_entry.business_day, voucher: l.journal_entry.label, journal_entry_id: l.journal_entry_id, kind: l.journal_entry.kind, description: l.description || l.journal_entry.description,
          debit_minor: l.debit_minor, credit_minor: l.credit_minor, balance_minor: balance }
      end
      { account: FinanceSerializers.gl_account(account), from: from, to: to, opening_minor: opening, rows: rows, closing_minor: balance }
    end
  end
end

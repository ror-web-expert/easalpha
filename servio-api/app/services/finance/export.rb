require "csv"

module Finance
  # Journal export for QuickBooks or Xero: one line per posting with debit and credit columns.
  module Export
    module_function

    ACCOUNTS = { "order_payment" => ["Sales", "credit"], "refund" => ["Sales", "debit"], "expense" => ["Expenses", "debit"], "supplier_payment" => ["Accounts Payable", "debit"],
                 "customer_payment" => ["Accounts Receivable", "credit"], "customer_refund" => ["Accounts Receivable", "debit"], "transfer_in" => ["Transfers", "credit"], "transfer_out" => ["Transfers", "debit"],
                 "deposit" => ["Owner Deposits", "credit"], "withdrawal" => ["Owner Drawings", "debit"], "adjustment" => ["Cash Over/Short", "credit"], "rider_float" => ["Rider Float", "debit"],
                 "opening" => ["Opening Balance", "credit"], "closing" => ["Closing Balance", "debit"] }.freeze

    def journal_csv(branch:, from:, to:, format: "quickbooks")
      entries = AccountEntry.where(branch_id: branch.id, business_day: from..to).includes(:payment_account).order(:business_day, :occurred_at)
      headers = format == "xero" ? %w[*Date *Description *AccountCode *Debit *Credit Reference] : %w[Date RefNumber Account Debit Credit Memo]
      CSV.generate do |csv|
        csv << headers
        entries.each do |e|
          cash_account = "#{e.payment_account.kind.capitalize}: #{e.payment_account.name}"
          contra, _side = ACCOUNTS.fetch(e.kind, ["Other", "credit"])
          amount = e.amount_minor.abs / 100.0
          ref = e.ref_id.to_s[0, 8]
          # Money into the account: debit the cash account, credit the contra. Money out: the reverse.
          lines = e.amount_minor.positive? ? [[cash_account, amount, 0], [contra, 0, amount]] : [[contra, amount, 0], [cash_account, 0, amount]]
          lines.each do |acct, dr, cr|
            csv << (format == "xero" ? [e.business_day, e.description, acct, dr.nonzero? || "", cr.nonzero? || "", ref] : [e.business_day, ref, acct, dr.nonzero? || "", cr.nonzero? || "", e.description])
          end
        end
      end
    end
  end
end

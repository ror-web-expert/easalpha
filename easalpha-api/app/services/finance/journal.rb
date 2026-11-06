module Finance
  # SPEC Journal Voucher and the automatic journal lines behind it. Every posting is balanced, numbered JV-000001 and
  # insert-only; mistakes are reversed, never edited. Money movements call in from the payment accounts, stock from the
  # ledger, so Trial Balance and Balance Sheet tie out with the operational ledgers.
  module Journal
    module_function

    # lines: [{ account: GlAccount | code, debit_minor:, credit_minor:, description: }]
    def post!(business_day:, lines:, description: nil, kind: "auto", ref: nil, actor: nil, branch_id: nil, reverses: nil)
      rows = Array(lines).map do |l|
        acct = l[:account].is_a?(GlAccount) ? l[:account] : Chart.account(l[:account].to_s)
        { account: acct, debit: l[:debit_minor].to_i, credit: l[:credit_minor].to_i, description: l[:description] }
      end.reject { |r| r[:debit].zero? && r[:credit].zero? }
      raise Api::Errors::BadRequest.new("journal.lines", "A voucher needs at least two lines") if rows.size < 2
      raise Api::Errors::BadRequest.new("journal.header", "#{rows.find { |r| r[:account].is_header }[:account].code} is a header account") if rows.any? { |r| r[:account].is_header }
      raise Api::Errors::BadRequest.new("journal.one_side", "Each line is either a debit or a credit") if rows.any? { |r| r[:debit].positive? && r[:credit].positive? }
      raise Api::Errors::BadRequest.new("journal.unbalanced", "Debits #{rows.sum { |r| r[:debit] }} do not equal credits #{rows.sum { |r| r[:credit] }}") unless rows.sum { |r| r[:debit] } == rows.sum { |r| r[:credit] }
      JournalEntry.transaction do
        e = JournalEntry.create!(number: DocumentCounter.next!("journal_entry"), kind: kind, business_day: business_day, description: description, ref_table: ref&.class&.table_name, ref_id: ref&.id,
                                 by_membership_id: actor&.id, branch_id: branch_id || Current.branch_id, posted_at: Time.current, reverses_id: reverses&.id)
        rows.each { |r| e.lines.create!(gl_account: r[:account], debit_minor: r[:debit], credit_minor: r[:credit], description: r[:description]) }
        reverses&.update!(reversed_by_id: e.id)
        AuditLog.record(action: kind == "manual" ? "create" : "journal_post", record: e, after: { number: e.label, debit_minor: rows.sum { |r| r[:debit] }, lines: rows.size }) if kind == "manual"
        e
      end
    end

    # The business day for a posting made now: the current branch's, else the first branch's, else the calendar date.
    def today = (Current.branch || (Current.business_id && Branch.unscoped.where(business_id: Current.business_id).order(:created_at).first))&.business_day_for(Time.current) || Date.current

    def reverse!(entry, actor:, business_day: nil, description: nil)
      business_day ||= today
      raise Api::Errors::Conflict.new("journal.reversed", "#{entry.label} is already reversed") if entry.reversed?
      post!(business_day: business_day, kind: "reversal", reverses: entry, actor: actor, description: description || "Reversal of #{entry.label}", branch_id: entry.branch_id,
            lines: entry.lines.map { |l| { account: l.gl_account, debit_minor: l.credit_minor, credit_minor: l.debit_minor, description: l.description } })
    end

    # Reverses whatever was posted for a record (a goods receipt that is cancelled, for example).
    def reverse_for!(ref, actor: nil, business_day: nil)
      business_day ||= today
      JournalEntry.where(ref_table: ref.class.table_name, ref_id: ref.id, reversed_by_id: nil, kind: "auto").find_each { |e| reverse!(e, actor: actor, business_day: business_day) }
    end

    COUNTER = { "order_payment" => :sale, "refund" => :sale, "expense" => :expense, "supplier_payment" => "2010", "customer_payment" => "1100", "customer_refund" => "1100",
                "deposit" => :movement, "withdrawal" => :movement, "opening" => "3010", "adjustment" => :adjustment, "rider_float" => "1030" }.freeze

    # A drawer movement by its kind: a drop goes to the safe and cash in comes from it, a payout or cash out is a
    # petty expense, a rider float is petty cash. Deposits and withdrawals on a company account stay the owner's.
    MOVEMENT_COUNTER = { "drop" => "1050", "cash_in" => "1050", "cash_out" => "5190", "payout" => "5190", "float_issue" => "1030", "float_return" => "1030" }.freeze

    # One payment-account entry becomes one balanced journal: the account's ledger mirror against its counterpart.
    def from_account_entry!(entry)
      return if entry.kind.in?(%w[transfer_in transfer_out closing])
      counter = COUNTER[entry.kind] or return
      mirror = Chart.for_payment_account(entry.payment_account)
      amount = entry.amount_minor.abs
      return if amount.zero?
      if counter == :sale
        record = entry.ref_table == "payments" ? Payment.find_by(id: entry.ref_id) : (entry.ref_table == "refunds" ? Refund.find_by(id: entry.ref_id) : nil)
        return sale_split!(record, money_account: mirror, amount_minor: entry.amount_minor, business_day: entry.business_day, description: entry.description, branch_id: entry.branch_id) if record
        counter = "4000" # an entry with no order behind it
      end
      counter = case counter
      when :expense then expense_account_for(entry)
      when :adjustment then entry.amount_minor.positive? ? "4100" : "5190"
      when :movement then movement_account_for(entry)
      else counter
      end
      lines = entry.amount_minor.positive? ? [ { account: mirror, debit_minor: amount }, { account: counter, credit_minor: amount } ] : [ { account: counter, debit_minor: amount }, { account: mirror, credit_minor: amount } ]
      post!(business_day: entry.business_day, lines: lines, description: entry.description, ref: entry, branch_id: entry.branch_id)
    end

    def expense_account_for(entry)
      return "5190" unless entry.ref_table == "expenses"
      e = Expense.find_by(id: entry.ref_id)
      e ? Chart.for_expense_category(e.category) : "5190"
    end

    def movement_account_for(entry)
      mv = entry.ref_table == "cash_movements" ? CashMovement.find_by(id: entry.ref_id) : nil
      MOVEMENT_COUNTER[mv&.kind] || (entry.amount_minor.positive? ? "3010" : "3020")
    end

    # What a sale is made of, each part to its own account: the net sale, tax collected, service and delivery
    # charges, tips owed to staff, and the rounding that made the total a whole figure.
    SALE_ACCOUNTS = { sales: "4000", tax: "2100", service_charge: "4010", delivery_charge: "4020", tip: "2400", rounding: "4120" }.freeze

    # The parts of an order's total, in minor units; the sale is whatever the other parts leave (so an inclusive tax
    # comes out of it too). nil for an order with nothing to pay.
    def sale_parts(order)
      total = order.total_minor.to_i
      return nil if total <= 0
      tax, service, delivery, tip, rounding = %i[tax_minor service_charge_minor delivery_charge_minor tip_minor rounding_minor].map { |f| order.public_send(f).to_i }
      { sales: total - tax - service - delivery - tip - rounding, tax: tax, service_charge: service, delivery_charge: delivery, tip: tip, rounding: rounding }
    end

    # Splits an amount across the parts in proportion, largest remainder, so the pieces add up to the amount exactly.
    def allocate(amount, parts)
      total = parts.values.sum
      return parts.transform_values { 0 } if amount.zero? || total.zero?
      return parts.dup if amount == total
      shares = parts.transform_values { |v| Rational(v * amount, total) }
      out = shares.transform_values(&:floor)
      shares.sort_by { |_, s| -(s - s.floor) }.first(amount - out.values.sum).each { |k, _| out[k] += 1 }
      out
    end

    # The sale split already in the journal for an order's payments and refunds (credits positive), by part. A cash,
    # card or wallet sale paid before the split (fix round 2, 6 Nov 2026) was journaled against its account entry with
    # the whole amount in Sales; those vouchers count too, so a refund sees what was really posted (ledger#8).
    def sale_posted(order)
      payments = Payment.where(order_id: order.id).select(:id)
      refunds = Refund.where(order_id: order.id).select(:id)
      legacy = AccountEntry.where(ref_table: "payments", ref_id: payments).or(AccountEntry.where(ref_table: "refunds", ref_id: refunds)).select(:id)
      entries = JournalEntry.where(reversed_by_id: nil)
                            .where("(ref_table = 'payments' AND ref_id IN (:p)) OR (ref_table = 'refunds' AND ref_id IN (:r)) OR (ref_table = 'account_entries' AND ref_id IN (:a))", p: payments, r: refunds, a: legacy)
      rows = JournalLine.joins(:gl_account).where(journal_entry_id: entries.select(:id), gl_accounts: { code: SALE_ACCOUNTS.values })
                        .group("gl_accounts.code").pluck(Arel.sql("gl_accounts.code"), Arel.sql("SUM(credit_minor) - SUM(debit_minor)")).to_h
      SALE_ACCOUNTS.transform_values { |code| rows[code].to_i }
    end

    # A payment (amount positive) or refund (negative) on an order: the money account against the sale split. The
    # revenue side is brought up to the share of what the order has received net of refunds, so split payments add
    # up exactly, a full refund takes back exactly what the sale posted, and a reopened order whose total changed is
    # corrected by its next payment. Once per record: a repeat posts nothing.
    def sale_split!(record, money_account:, amount_minor:, business_day:, description:, branch_id:)
      return if amount_minor.zero? || JournalEntry.exists?(ref_table: record.class.table_name, ref_id: record.id)
      deltas = sale_deltas(record.order, amount_minor)
      lines = deltas.filter_map { |k, d| d.zero? ? nil : (d.positive? ? { account: SALE_ACCOUNTS[k], credit_minor: d } : { account: SALE_ACCOUNTS[k], debit_minor: -d }) }
      lines << (amount_minor.positive? ? { account: money_account, debit_minor: amount_minor } : { account: money_account, credit_minor: -amount_minor })
      post!(business_day: business_day, lines: lines, description: description, ref: record, branch_id: branch_id)
    end

    # What one payment or refund moves on each sale account (credits positive).
    def sale_deltas(order, amount_minor)
      parts = sale_parts(order) || { sales: amount_minor.abs }
      net = Payment.where(order_id: order.id, status: "captured").sum(:amount_minor) - Refund.where(order_id: order.id).sum(:amount_minor)
      posted = sale_posted(order)
      deltas = allocate(net, parts).to_h { |k, v| [ k, v - posted[k] ] }
      return deltas if deltas.values.sum == amount_minor && (amount_minor.positive? || deltas.values.none?(&:positive?))
      # A refund only takes back, and never more than an account holds for the order: one of a sale journaled whole to
      # Sales (before the split) comes out of Sales, instead of pushing Tax, Tips Payable and Rounding below zero or
      # moving old revenue into tax on the refund's day.
      if amount_minor.negative?
        held = posted.select { |_, v| v.positive? }
        return allocate(-amount_minor, held).transform_values(&:-@) if held.values.sum >= -amount_minor
      end
      # Out of step otherwise (money with no voucher behind it): this record takes its own proportional share.
      allocate(amount_minor.abs, parts).transform_values { |v| amount_minor.negative? ? -v : v }
    end

    def transfer!(from:, to:, amount_minor:, business_day:, actor: nil, note: nil, ref: nil)
      post!(business_day: business_day, description: "Transfer #{from.name} to #{to.name}#{note.present? ? ": #{note}" : ''}", actor: actor, ref: ref,
            lines: [ { account: Chart.for_payment_account(to), debit_minor: amount_minor }, { account: Chart.for_payment_account(from), credit_minor: amount_minor } ])
    end

    # A sale settled to a customer account: receivable against the sale split.
    def khata_sale!(payment)
      sale_split!(payment, money_account: "1100", amount_minor: payment.amount_minor, business_day: payment.business_day, description: "Order #{payment.order.label} on account", branch_id: payment.branch_id)
    end

    # Money given back on an account sale: the sale split comes back out, the receivable goes down.
    def khata_refund!(refund)
      sale_split!(refund, money_account: "1100", amount_minor: -refund.amount_minor, business_day: refund.business_day, description: "Refund #{refund.order.label} on account: #{refund.reason}", branch_id: refund.branch_id)
    end

    # Internal methods move no money, so they post to what they stand for instead of a bank (QA B4): the company's
    # share of a canteen meal is the cost of feeding its staff, and the payroll's salary deduction is salary paid by
    # clearing what the worker owes for meals, so the salary expense carries it (gross pay, not only the cash).
    INTERNAL_ACCOUNTS = { "canteen_subsidy" => "5170", "canteen_payroll" => "5110" }.freeze

    def internal_account(method) = INTERNAL_ACCOUNTS.fetch(method.code, "5190")

    # A subsidised meal is a sale at its menu price: revenue and output tax are the order's own figures, as on the
    # receipt and any tax invoice sent to the authority (Tax::Invoicer reports the order's tax). The worker's share is
    # owed by the worker (1100, cleared by the payroll deduction); the company's share is a Staff Meals expense, so
    # profit falls by exactly what the subsidy costs, the tax on the company's share included.
    def internal_sale!(payment)
      sale_split!(payment, money_account: internal_account(payment.payment_method), amount_minor: payment.amount_minor, business_day: payment.business_day,
                           description: "Order #{payment.order.label} #{payment.payment_method.name}", branch_id: payment.branch_id)
    end

    def internal_refund!(refund)
      sale_split!(refund, money_account: internal_account(refund.payment_method), amount_minor: -refund.amount_minor, business_day: refund.business_day,
                          description: "Refund #{refund.order.label} #{refund.payment_method.name}: #{refund.reason}", branch_id: refund.branch_id)
    end

    # A receipt on a customer account by an internal method: the payroll's canteen deduction clears the worker's
    # receivable against the salary expense.
    def internal_receipt!(cp)
      return if JournalEntry.exists?(ref_table: "customer_payments", ref_id: cp.id)
      account = internal_account(cp.payment_method)
      amount = cp.amount_minor
      lines = cp.direction == "received" ? [ { account: account, debit_minor: amount }, { account: "1100", credit_minor: amount } ] : [ { account: "1100", debit_minor: amount }, { account: account, credit_minor: amount } ]
      post!(business_day: cp.business_day, lines: lines, ref: cp, branch_id: cp.branch_id,
            description: "#{cp.payment_method.name} #{cp.customer.name}#{cp.reference.present? ? ": #{cp.reference}" : ''}")
    end

    # A payslip's tip share is Tips Payable being paid, not a new salary expense: the salary expense recorded for the
    # payslip carried it, so it moves out of Salaries into 2400 (QA B11). Never below what Tips Payable holds: tips from
    # sales journaled before the split went to Sales, so paying those out stays a salary expense.
    def tips_paid!(payslip, amount_minor:, business_day:, branch_id:)
      held = JournalLine.joins(:gl_account).where(gl_accounts: { code: "2400" }).sum("credit_minor - debit_minor")
      amount = [ amount_minor.to_i, held ].min
      return if amount <= 0 || JournalEntry.exists?(ref_table: "payslips", ref_id: payslip.id)
      post!(business_day: business_day, lines: [ { account: "2400", debit_minor: amount }, { account: "5110", credit_minor: amount } ], ref: payslip, branch_id: branch_id,
            description: "Tips paid with #{payslip.payroll_run.label}: #{payslip.employee.name}")
    end

    # A supplier taken on with a balance carried over from before: payables against the owner's capital, as a
    # customer's opening balance is (QA B10). Negative: the supplier owes us.
    def supplier_opening!(supplier, business_day:, branch_id:)
      amount = supplier.opening_balance_minor.to_i
      return if amount.zero? || JournalEntry.exists?(ref_table: "suppliers", ref_id: supplier.id)
      lines = amount.positive? ? [ { account: "3010", debit_minor: amount }, { account: "2010", credit_minor: amount } ] : [ { account: "2010", debit_minor: -amount }, { account: "3010", credit_minor: -amount } ]
      post!(business_day: business_day, lines: lines, description: "Opening balance #{supplier.name}", ref: supplier, branch_id: branch_id)
    end

    # Goods received from a supplier: inventory against payables.
    def inventory_receipt!(grn)
      return if grn.total_minor.to_i.zero?
      post!(business_day: grn.business_day || today, description: "#{grn.label} from #{grn.supplier.name}", ref: grn, branch_id: grn.branch_id,
            lines: [ { account: "1200", debit_minor: grn.total_minor }, { account: "2010", credit_minor: grn.total_minor } ])
    end

    # The supplier credits the return at its own price while the stock leaves at the average cost it is carried at:
    # Inventory moves by what the stock ledger took out, so the account and the valuation agree (QA B12), and the gap
    # is a cost-of-goods gain or loss.
    def inventory_return!(ret)
      return if ret.amount_minor.to_i.zero?
      carried = ret.stock_document_id ? [ -StockLedgerEntry.where(ref_table: "stock_documents", ref_id: ret.stock_document_id).sum(:value_minor), 0 ].max : ret.amount_minor
      gap = ret.amount_minor - carried
      lines = [ { account: "2010", debit_minor: ret.amount_minor }, { account: "1200", credit_minor: carried } ]
      lines << (gap.positive? ? { account: "5000", credit_minor: gap } : { account: "5000", debit_minor: -gap }) unless gap.zero?
      post!(business_day: ret.business_day || today, description: "#{ret.label} to #{ret.supplier.name}", ref: ret, branch_id: ret.branch_id, lines: lines)
    end

    def supplier_adjustment!(adj)
      amount = adj.amount_minor.abs
      lines = adj.amount_minor.positive? ? [ { account: "5190", debit_minor: amount }, { account: "2010", credit_minor: amount } ] : [ { account: "2010", debit_minor: amount }, { account: "4100", credit_minor: amount } ]
      post!(business_day: adj.business_day, description: "Supplier adjustment #{adj.supplier.name}: #{adj.reason}", ref: adj, branch_id: adj.branch_id, lines: lines)
    end

    # Stock movements valued at average cost: sales and packaging to cost of goods, waste and shrinkage to waste,
    # receipts without a goods receipt and opening balances to capital.
    STOCK_COUNTER = { "sale" => "5000", "packaging" => "5000", "sale_return" => "5000", "waste" => "5200", "adjustment" => "5200", "count" => "5200", "receive" => "3010" }.freeze

    def stock_entries!(entries, ref:, description:, business_day:)
      rows = Array(entries).reject { |e| e.value_minor.to_i.zero? }
      return if rows.empty?
      by_counter = rows.group_by { |e| STOCK_COUNTER[e.kind] }.reject { |k, _| k.nil? }
      return if by_counter.empty?
      lines = by_counter.flat_map do |counter, es|
        value = es.sum { |e| e.value_minor.to_i }
        next [] if value.zero?
        # Stock leaving (negative value) debits the counter account and credits Inventory.
        value.negative? ? [ { account: counter, debit_minor: -value }, { account: "1200", credit_minor: -value } ] : [ { account: "1200", debit_minor: value }, { account: counter, credit_minor: value } ]
      end
      return if lines.empty?
      post!(business_day: business_day, description: description, ref: ref, lines: lines, branch_id: rows.first.branch_id)
    end
  end
end

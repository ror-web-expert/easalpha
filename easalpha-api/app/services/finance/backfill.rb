module Finance
  # One-off corrections for money recorded before the journal covered it, run by the finance:* rake tasks (a dry run
  # unless told to write). Each step is idempotent: what is already in the journal is left alone, so a second run
  # posts nothing. Every voucher is dated to the day of the record behind it, a locked day included: the record
  # already sits on that day in the customer and supplier ledgers, and the books should agree with them there.
  module Backfill
    module_function

    # Khata refunds made before the khata refund journal existed (deploy#5): the customer's balance went down but no
    # voucher was posted, so Accounts Receivable and Sales stayed overstated.
    def khata_refunds!(dry_run: true)
      refunds = Refund.by_method_kind("khata").where.not(id: JournalEntry.where(ref_table: "refunds").select(:ref_id)).includes(:order).order(:refunded_at, :created_at)
      run(dry_run) do
        refunds.map do |r|
          e = Journal.khata_refund!(r)
          row("#{r.order.label} refund #{r.business_day} #{money(r.amount_minor)} on account#{locked(r.branch_id, r.business_day)}", e)
        end
      end
    end

    # Suppliers taken on with an opening balance before openings were journaled (QA B10): Accounts Payable fell short
    # of the supplier ledgers by every opening.
    def supplier_openings!(dry_run: true)
      suppliers = Supplier.where.not(opening_balance_minor: 0).where.not(id: JournalEntry.where(ref_table: "suppliers").select(:ref_id)).order(:created_at)
      branch = Branch.order(:created_at).first
      run(dry_run) do
        suppliers.map do |s|
          day = branch.business_day_for(s.created_at)
          e = Journal.supplier_opening!(s, business_day: day, branch_id: branch.id)
          row("#{s.name} opening #{day} #{money(s.opening_balance_minor)}#{locked(branch.id, day)}", e)
        end
      end
    end

    # The canteen's internal methods once had a "custom" payment account under Cash at Bank (QA B4): the company's share
    # of every meal and every salary deduction sat there as money nobody had. Each day's net moves to what it stands for
    # (Journal::INTERNAL_ACCOUNTS), the account is closed with a closing entry (no journal) and archived, and the method
    # no longer points at it. An account that also holds other money, or that another method uses, is left as it is.
    def internal_methods!(dry_run: true)
      methods = PaymentMethod.where(internal: true).where.not(payment_account_id: nil).order(:code).to_a
      run(dry_run) do
        methods.flat_map do |m|
          pa = PaymentAccount.find_by(id: m.payment_account_id)
          problem = pa && foreign_money(pa)
          if problem
            [ { text: "#{m.name}: #{pa.name} left as it is (#{problem})", lines: [] } ]
          elsif pa
            reclass!(m, pa)
          else
            m.update_columns(payment_account_id: nil)
            [ { text: "#{m.name}: its account no longer exists; the method no longer points at it", lines: [] } ]
          end
        end
      end
    end

    def reclass!(method, pa)
      mirror = GlAccount.find_by(payment_account_id: pa.id)
      target = Journal.internal_account(method)
      by_day = mirror ? JournalLine.joins(:journal_entry).where(gl_account_id: mirror.id).group("journal_entries.business_day").order("journal_entries.business_day").sum("debit_minor - credit_minor") : {}
      branch_id = pa.branch_id || Branch.order(:created_at).first&.id
      rows = by_day.reject { |_, net| net.zero? }.map do |day, net|
        lines = net.positive? ? [ { account: target, debit_minor: net }, { account: mirror, credit_minor: net } ] : [ { account: mirror, debit_minor: -net }, { account: target, credit_minor: -net } ]
        e = Journal.post!(business_day: day, lines: lines, ref: pa, branch_id: branch_id, description: "#{pa.name} to #{target}: #{method.name} moves no money")
        row("#{method.name} #{day} #{money(net)} from #{mirror.code} to #{target}", e)
      end
      if pa.current_balance_minor.nonzero?
        pa.post!(kind: "closing", amount_minor: -pa.current_balance_minor, business_day: Journal.today, description: "Closed: #{method.name} moves no money", skip_journal: true)
      end
      pa.update!(active: false, archived_at: Time.current)
      method.update_columns(payment_account_id: nil)
      rows << { text: "#{method.name}: #{pa.name} closed and archived", lines: [] }
    end

    # Why an internal method's old account cannot simply be closed: it holds entries or vouchers that are not the
    # internal methods' own, or a method that moves real money still uses it.
    def foreign_money(pa)
      return "another payment method uses it" if PaymentMethod.where(payment_account_id: pa.id, internal: false).exists?
      internal = PaymentMethod.where(internal: true).select(:id)
      own = AccountEntry.where(payment_account_id: pa.id)
                        .where("(ref_table = 'payments' AND ref_id IN (:p)) OR (ref_table = 'refunds' AND ref_id IN (:r)) OR (ref_table = 'customer_payments' AND ref_id IN (:c))",
                               p: Payment.where(payment_method_id: internal).select(:id), r: Refund.where(payment_method_id: internal).select(:id), c: CustomerPayment.where(payment_method_id: internal).select(:id))
      return "it holds other entries" if AccountEntry.where(payment_account_id: pa.id).where.not(id: own.select(:id)).exists?
      mirror = GlAccount.find_by(payment_account_id: pa.id) or return nil
      # Vouchers of those entries (the old journal referenced the entry) or of the internal records themselves.
      vouchers = JournalEntry.where("(ref_table = 'account_entries' AND ref_id IN (:e)) OR (ref_table = 'payments' AND ref_id IN (:p)) OR (ref_table = 'refunds' AND ref_id IN (:r)) OR (ref_table = 'customer_payments' AND ref_id IN (:c))",
                                    e: own.select(:id), p: Payment.where(payment_method_id: internal).select(:id), r: Refund.where(payment_method_id: internal).select(:id), c: CustomerPayment.where(payment_method_id: internal).select(:id))
      "its ledger account has other vouchers" if JournalLine.where(gl_account_id: mirror.id).where.not(journal_entry_id: vouchers.select(:id)).exists?
    end

    # Runs a step in one transaction, rolled back on a dry run so the rows show exactly what would be posted.
    def run(dry_run)
      rows = []
      ActiveRecord::Base.transaction do
        rows = yield.compact
        raise ActiveRecord::Rollback if dry_run
      end
      rows
    end

    def row(text, entry)
      { text: entry ? "#{text}: #{entry.label}" : "#{text}: nothing to post", lines: entry ? entry.lines.map { |l| "#{l.gl_account.code} #{l.gl_account.name}: Dr #{money(l.debit_minor)} Cr #{money(l.credit_minor)}" } : [] }
    end

    def locked(branch_id, day) = DayClose.locked?(branch_id, day) ? " (locked day)" : ""
    def money(minor) = format("Rs %.2f", minor.to_i / 100.0)
  end
end

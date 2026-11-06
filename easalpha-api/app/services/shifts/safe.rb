module Shifts
  # A branch's safe, as a payment account mirrored under 1050 Cash in Safe. A float or cash in comes out of it, a drop
  # and the float at the count go back into it, and banking it is a transfer to a bank account on Payment Accounts.
  # Before this the float was booked as new owner's capital every shift, and 1050 could only fill up (QA B3 and B7,
  # review ledger#3 and ledger#7). Each move is one balanced voucher between the drawer and the safe.
  module Safe
    module_function

    # The branch's own safe, else one made on Payment Accounts for no branch in particular, else a new one.
    def account_for(branch)
      existing(branch) || Branch.transaction do
        branch.lock!
        existing(branch) || create_for!(branch)
      end
    end

    def existing(branch) = PaymentAccount.active.where(kind: "safe").order(Arel.sql("branch_id IS NULL"), :created_at).find_by(branch_id: [ branch.id, nil ])

    # Drops booked straight to 1050 before the safe was an account come into it, so they can be banked as well.
    def create_for!(branch)
      safe = PaymentAccount.create!(name: "Safe: #{branch.name}", kind: "safe", branch_id: branch.id)
      held = legacy_balance(branch)
      return safe if held.zero?
      day = branch.business_day_for(Time.current)
      entry = safe.post!(kind: "opening", amount_minor: held, business_day: day, description: "Drops recorded in Cash in Safe before the safe was an account", branch_id: branch.id, skip_journal: true)
      mirror = Finance::Chart.for_payment_account(safe)
      lines = held.positive? ? [ { account: mirror, debit_minor: held }, { account: "1050", credit_minor: held } ] : [ { account: "1050", debit_minor: -held }, { account: mirror, credit_minor: -held } ]
      Finance::Journal.post!(business_day: day, lines: lines, description: "Cash in Safe moved into #{safe.name}", ref: entry, branch_id: branch.id)
      safe
    end

    # What vouchers left on 1050 itself for this branch (the main branch also takes those with no branch).
    def legacy_balance(branch)
      account = GlAccount.find_by(code: "1050") or return 0
      lines = JournalLine.joins(:journal_entry).where(gl_account_id: account.id)
      lines = branch.is_main ? lines.where(journal_entries: { branch_id: [ branch.id, nil ] }) : lines.where(journal_entries: { branch_id: branch.id })
      lines.sum(:debit_minor) - lines.sum(:credit_minor)
    end

    # Cash into a shift's drawer (the opening float, a cash in): from the safe as far as the safe holds it, the rest
    # the owner's (3010). The first float the books never saw is capital once, and the safe never goes below zero.
    def issue!(shift:, amount_minor:, entry_kind:, ref:, description:, by:, day:)
      drawer = shift.drawer_account
      safe = account_for(shift.branch).lock!
      from_safe = [ amount_minor, [ safe.current_balance_minor, 0 ].max ].min
      entry = drawer.post!(kind: entry_kind, amount_minor: amount_minor, business_day: day, ref: ref, description: description, by: by, shift_id: shift.id, branch_id: shift.branch_id, skip_journal: true)
      safe.post!(kind: "transfer_out", amount_minor: -from_safe, business_day: day, ref: ref, description: "#{description}: to #{drawer.name}", by: by, shift_id: shift.id, branch_id: shift.branch_id, skip_journal: true) if from_safe.positive?
      lines = [ { account: Finance::Chart.for_payment_account(drawer), debit_minor: amount_minor } ]
      lines << { account: Finance::Chart.for_payment_account(safe), credit_minor: from_safe } if from_safe.positive?
      lines << { account: "3010", credit_minor: amount_minor - from_safe, description: "Not in the safe: the owner's money" } if amount_minor > from_safe
      Finance::Journal.post!(business_day: day, lines: lines, description: description, ref: entry, actor: by, branch_id: shift.branch_id)
      entry
    end

    # Cash out of a shift's drawer into the safe (a drop, the float at the count).
    def receive!(shift:, amount_minor:, entry_kind:, ref:, description:, by:, day:)
      drawer = shift.drawer_account
      safe = account_for(shift.branch).lock!
      entry = drawer.post!(kind: entry_kind, amount_minor: -amount_minor, business_day: day, ref: ref, description: description, by: by, shift_id: shift.id, branch_id: shift.branch_id, skip_journal: true)
      safe.post!(kind: "transfer_in", amount_minor: amount_minor, business_day: day, ref: ref, description: "#{description}: from #{drawer.name}", by: by, shift_id: shift.id, branch_id: shift.branch_id, skip_journal: true)
      Finance::Journal.post!(business_day: day, description: description, ref: entry, actor: by, branch_id: shift.branch_id,
                             lines: [ { account: Finance::Chart.for_payment_account(safe), debit_minor: amount_minor }, { account: Finance::Chart.for_payment_account(drawer), credit_minor: amount_minor } ])
      entry
    end

    # The float a shift gave back to the safe at its count (its rows on the safe that reference the shift).
    def returned(shift) = AccountEntry.where(kind: "transfer_in", ref_table: "shifts", ref_id: shift.id, payment_account_id: PaymentAccount.where(kind: "safe").select(:id))
  end
end

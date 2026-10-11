module Expenses
  # Records an expense against a category and posts it to the paying account (petty cash from the drawer when a shift is open and the method is cash).
  module Recorder
    module_function

    def create!(attrs, actor:, branch:, shift: nil, source: "admin")
      if attrs[:client_id].present? && (existing = Expense.find_by(client_id: attrs[:client_id]))
        return existing
      end
      category = ExpenseCategory.active.find(attrs[:category_id])
      amount = attrs[:amount_minor].to_i
      raise Api::Errors::BadRequest.new("expense.amount", "Amount must be positive") unless amount.positive?
      method = attrs[:method_code].present? ? PaymentMethod.active.find_by!(code: attrs[:method_code]) : PaymentMethod.active.find_by(kind: "cash")
      raise Api::Errors::BadRequest.new("expense.method", "Expenses cannot be paid on khata") if method&.khata?
      spent_on = attrs[:spent_on].present? ? Date.parse(attrs[:spent_on].to_s) : branch.business_day_for(Time.current)
      day = branch.business_day_for(Time.current)
      Expense.transaction do
        account = method&.cash? && shift&.drawer_account ? shift.drawer_account : method&.payment_account
        e = Expense.create!(branch: branch, category: category, number: DocumentCounter.next!("expense"), amount_minor: amount, payment_method: method, payment_account: account, shift: shift,
                            client_id: attrs[:client_id].presence, receipt_key: attrs[:receipt_key], paid_to: attrs[:paid_to], note: attrs[:note], spent_on: spent_on, business_day: day, source: source,
                            by_membership_id: actor&.id, approved_by_membership_id: attrs[:approved_by_id])
        account&.post!(kind: "expense", amount_minor: -amount, business_day: day, ref: e, description: "#{category.full_name}#{attrs[:paid_to].present? ? " to #{attrs[:paid_to]}" : ''}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        AuditLog.record(action: "create", record: e, after: { category: category.full_name, amount_minor: amount, method: method&.code, source: source })
        e
      end
    end

    def void!(expense, actor:, reason:)
      raise Api::Errors::Conflict.new("expense.voided", "Already voided") if expense.voided?
      Expense.transaction do
        if expense.payment_account
          entry = AccountEntry.find_by(ref_table: "expenses", ref_id: expense.id, kind: "expense", reversed_by_entry_id: nil)
          expense.payment_account.reverse!(entry, by: actor, description: "Void #{expense.label}: #{reason}") if entry
        end
        expense.update!(voided_at: Time.current, void_reason: reason)
        AuditLog.record(action: "void", record: expense, after: { reason: reason, amount_minor: expense.amount_minor })
      end
      expense
    end
  end
end

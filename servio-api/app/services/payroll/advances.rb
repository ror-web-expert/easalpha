module Payroll
  module Advances
    module_function

    def request!(employee, amount_minor:, reason:, by:, installment_minor: nil)
      Advance.create!(employee: employee, number: DocumentCounter.next!("advance"), amount_minor: amount_minor, outstanding_minor: amount_minor, installment_minor: installment_minor, reason: reason, requested_on: Date.current, status: "pending")
    end

    def decide!(advance, approve:, by:)
      raise Api::Errors::Conflict.new("advance.status", "Advance is #{advance.status}") unless advance.status == "pending"
      advance.update!(status: approve ? "approved" : "rejected", approved_by_membership_id: by&.id)
      advance
    end

    # Paying an approved advance records an expense (Salaries / Advance) from the drawer or company cash.
    def pay!(advance, actor:, branch:, shift: nil, method_code: "cash")
      raise Api::Errors::Conflict.new("advance.status", "Advance is #{advance.status}") unless advance.status == "approved"
      category = ExpenseCategory.active.find_by(name: "Advance") || ExpenseCategory.active.find_by(name: "Salaries") || ExpenseCategory.create!(name: "Salaries")
      e = Expenses::Recorder.create!({ category_id: category.id, amount_minor: advance.amount_minor, method_code: method_code, paid_to: advance.employee.name, note: "Advance #{advance.label}" }, actor: actor, branch: branch, shift: shift, source: "payroll_sync")
      advance.update!(status: "paid", paid_at: Time.current, expense_id: e.id, payment_account_id: e.payment_account_id)
      advance
    end
  end
end

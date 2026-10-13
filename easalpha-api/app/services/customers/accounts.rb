module Customers
  # Opening balances and balance corrections on a customer account. Every change is a new insert-only row with a reason,
  # who entered it and who approved it, a journal voucher and an audit record; a mistake is reversed, never edited.
  module Accounts
    module_function

    # kind: "opening" (the balance carried over from a paper register) or "adjustment" (a correction).
    # amount_minor is signed: positive means the customer owes more, negative means they owe less.
    def adjust!(customer, kind:, amount_minor:, reason:, actor:, branch:, approver: nil, effective_on: nil)
      BusinessModules.require!(customer.business, "customer_accounts")
      raise Api::Errors::BadRequest.new("adjustment.kind", "Kind must be opening or adjustment") unless kind.to_s.in?(%w[opening adjustment])
      raise Api::Errors::Conflict.new("khata.walk_in", "The walk-in customer has no account") if customer.is_walk_in
      amount = Integer(amount_minor.to_s, exception: false)
      raise Api::Errors::BadRequest.new("adjustment.amount", "Enter an amount other than zero") if amount.nil? || amount.zero?
      raise Api::Errors::BadRequest.new("adjustment.reason", "A reason is required") if reason.to_s.strip.blank?
      today = branch.business_day_for(Time.current)
      on = effective_on.present? ? Date.parse(effective_on.to_s) : today
      raise Api::Errors::BadRequest.new("adjustment.date", "The date cannot be in the future") if on > today
      if kind.to_s == "opening" && open_opening(customer).exists?
        raise Api::Errors::Conflict.new("khata.opening_exists", "#{customer.name} already has an opening balance. Reverse it first, or enter an adjustment.")
      end
      record!(customer, kind: kind.to_s, amount: amount, reason: reason.to_s.strip, actor: actor, approver: approver, branch: branch, on: on, today: today)
    end

    # Reverses an opening balance or an adjustment with a new row of the opposite amount, dated today.
    def reverse!(adjustment, reason:, actor:, branch:, approver: nil)
      BusinessModules.require!(adjustment.customer.business, "customer_accounts")
      raise Api::Errors::Conflict.new("adjustment.reversal", "A reversal cannot be reversed; enter a new adjustment instead") if adjustment.kind == "reversal"
      raise Api::Errors::Conflict.new("adjustment.reversed", "#{adjustment.label} is already reversed") if adjustment.reversed?
      raise Api::Errors::BadRequest.new("adjustment.reason", "A reason is required") if reason.to_s.strip.blank?
      today = branch.business_day_for(Time.current)
      record!(adjustment.customer, kind: "reversal", amount: -adjustment.amount_minor, reason: reason.to_s.strip, actor: actor, approver: approver, branch: branch, on: today, today: today, reverses: adjustment)
    end

    def open_opening(customer)
      CustomerAdjustment.where(customer_id: customer.id, kind: "opening").where.not(id: CustomerAdjustment.where.not(reverses_id: nil).select(:reverses_id))
    end

    def record!(customer, kind:, amount:, reason:, actor:, approver:, branch:, on:, today:, reverses: nil)
      adj = nil
      previous = nil
      Customer.transaction do
        customer.lock!
        previous = customer.balance_minor
        customer.update!(balance_minor: customer.balance_minor + amount)
        adj = CustomerAdjustment.create!(customer: customer, branch_id: branch.id, number: DocumentCounter.next!("customer_adjustment"), kind: kind, amount_minor: amount, reason: reason,
                                         effective_on: on, business_day: today, by_membership_id: actor&.id, approved_by_membership_id: approver&.id, reverses: reverses)
        post_journal!(adj, reverses)
        AuditLog.record(action: kind == "reversal" ? "reverse" : "create", record: adj, approved_by: approver&.user,
                        after: { customer: customer.name, khata_no: customer.khata_no, kind: kind, amount_minor: amount, reason: reason, effective_on: on, balance_before_minor: previous, balance_after_minor: customer.balance_minor, reverses: reverses&.label })
      end
      Customers::Notify.adjustment!(adj, previous_balance_minor: previous)
      adj
    end

    # Opening: receivable against owner's capital. Correction up: receivable against other income; down: sales
    # discounts against receivable. A reversal reverses the original voucher.
    def post_journal!(adj, reverses)
      return Finance::Journal.reverse_for!(reverses, business_day: adj.business_day) if reverses
      amount = adj.amount_minor.abs
      counter = adj.kind == "opening" ? "3010" : (adj.amount_minor.positive? ? "4100" : "4900")
      lines = adj.amount_minor.positive? ? [ { account: "1100", debit_minor: amount }, { account: counter, credit_minor: amount } ] : [ { account: counter, debit_minor: amount }, { account: "1100", credit_minor: amount } ]
      Finance::Journal.post!(business_day: adj.business_day, lines: lines, ref: adj, branch_id: adj.branch_id,
                             description: "#{adj.kind == 'opening' ? 'Opening balance' : 'Account adjustment'} #{adj.customer.name}: #{adj.reason}")
    end
  end
end

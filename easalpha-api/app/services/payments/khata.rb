module Payments
  # Money received from a customer against their account, or paid back to them.
  module Khata
    module_function

    # id: the till's own UUID for a payment taken offline, so a replay of the same record is a duplicate, never a second receipt.
    # received_on: the day the money came, when it is not today (a bank transfer seen later, or entered after
    # midnight); never in the future, never into a locked day, and only for someone who may adjust accounts.
    def receive!(customer, amount_minor:, method_code:, reference: nil, actor:, shift: nil, branch:, direction: "received", id: nil, received_on: nil)
      raise Api::Errors::BadRequest.new("payment.amount", "Amount must be positive") unless amount_minor.positive?
      raise Api::Errors::Conflict.new("khata.walk_in", "The walk-in customer has no account") if customer.is_walk_in
      method = PaymentMethod.active.find_by!(code: method_code)
      raise Api::Errors::BadRequest.new("khata.method", "Choose a cash, card, wallet or bank method") if method.khata?
      day = dated(received_on, today: branch.business_day_for(Time.current), actor: actor)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if DayClose.locked?(branch.id, day)
      cp = nil
      Customer.transaction do
        customer.lock!
        delta = direction == "received" ? -amount_minor : amount_minor
        customer.update!(balance_minor: customer.balance_minor + delta)
        cp = CustomerPayment.create!(id: id || SecureRandom.uuid, customer: customer, branch_id: branch.id, direction: direction, amount_minor: amount_minor, payment_method: method, payment_account: method.payment_account,
                                     reference: reference, collected_by_membership_id: actor&.id, shift_id: shift&.id, business_day: day, received_at: Time.current)
        account = method.cash? && shift&.drawer_account ? shift.drawer_account : method.payment_account
        cp.update_column(:payment_account_id, account.id) if account
        account&.post!(kind: direction == "received" ? "customer_payment" : "customer_refund", amount_minor: direction == "received" ? amount_minor : -amount_minor,
                                      business_day: day, ref: cp, description: "#{direction == 'received' ? 'Khata payment from' : 'Paid to'} #{customer.name}", by: actor, shift_id: shift&.id, branch_id: branch.id)
        AuditLog.record(action: "create", record: cp, after: { customer: customer.name, amount_minor: amount_minor, direction: direction, method: method.code })
      end
      if direction == "received" && customer.phone.present? && customer.business.setting("whatsapp_balance_message", true) && Whatsapp::Account.auto_send_on_payment?(customer.business)
        Whatsapp::Sender.deliver(phone: customer.phone, template: "khata_payment_received", customer_id: customer.id,
                                 variables: { customer_name: customer.name, amount: amount_minor / 100, new_balance: customer.balance_minor / 100, business_name: customer.business.name })
      end
      cp
    end

    def dated(received_on, today:, actor:)
      return today if received_on.blank?
      on = begin
        Date.parse(received_on.to_s)
      rescue Date::Error
        raise Api::Errors::BadRequest.new("payment.date", "Dates must be YYYY-MM-DD")
      end
      raise Api::Errors::BadRequest.new("payment.date", "The date cannot be in the future") if on > today
      # Only someone who may adjust accounts dates money to another day: the default cashier holds customers.manage, so
      # that permission is not enough (QA 6 Nov 2026: a cashier backdated a payment a month).
      allowed = on == today || actor&.can?("khata.adjust")
      raise Api::Errors::Forbidden.new("permission.denied", "Dating a payment to another day needs khata.adjust") unless allowed
      on
    end
  end
end

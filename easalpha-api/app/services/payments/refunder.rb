module Payments
  # Refunds part or all of a paid order back through a payment method. Manager only.
  class Refunder
    # What was put on the customer's account goes back to the account: refunding it in cash or by card would pay out money
    # the customer never paid (QA 6 Nov 2026). Cash, card, wallet and bank are interchangeable (a card sale refunded in
    # cash is fine), and an account refund of a cash sale is store credit, allowed when the order has a customer.
    def self.check_method!(order, method, amount_minor)
      on_account = ->(scope) { scope.joins(:payment_method).where(payment_methods: { kind: "khata" }) }
      paid = Payment.where(order_id: order.id, status: "captured")
      back = Refund.where(order_id: order.id)
      if method.khata?
        raise Api::Errors::Conflict.new("refund.method", "Order #{order.label} has no customer to credit") if order.customer_id.blank?
        return
      end
      other = (paid.sum(:amount_minor) - on_account.(paid).sum(:amount_minor)) - (back.sum(:amount_minor) - on_account.(back).sum(:amount_minor))
      return if amount_minor <= other
      raise Api::Errors::Conflict.new("refund.method", other.positive? ? "Only #{other / 100} of order #{order.label} was paid in money; refund the rest to the customer's account" : "Order #{order.label} was put on the customer's account: refund it to the account, not in money")
    end

    # The money an order still holds: what was captured less what went back. paid_minor is not that once a settled
    # order was part refunded (see below), so whether anything is left to give back is read from here.
    def self.held_minor(order)
      Payment.where(order_id: order.id, status: "captured").sum(:amount_minor) - Refund.where(order_id: order.id).sum(:amount_minor)
    end

    # On an open order, money goes back as money, not as a correction of the sale. A part payment on an order never
    # completed (no paid_at) can go back, whole or in part: the order stays open and owes it again, and once it holds
    # nothing it can be voided (the customer left; ledger#0). A reopened order keeps a paid order's rules: only what it
    # was paid beyond its total goes back while it is open (completing it waits for that, order.overpaid); the rest is
    # refunded once it is completed again.
    def self.check_open!(order, amount_minor)
      return if order.paid_minor < order.total_minor && order.paid_at.nil?
      excess = order.paid_minor - order.total_minor
      return if excess.positive? && amount_minor <= excess
      raise Api::Errors::Conflict.new("refund.order_open", "Order #{order.label} is open: complete it before refunding.") unless excess.positive?
      raise Api::Errors::Conflict.new("refund.order_open", "Order #{order.label} is still #{order.status}: only the Rs #{Customers::Notify.rupees(excess)} paid above its total can be refunded before it is completed.")
    end

    def self.call(order, amount_minor:, method_code:, reason:, actor:, approver: nil, device: nil, shift: nil, id: nil)
      method = PaymentMethod.active.find_by!(code: method_code)
      refund = nil
      refunded = captured = full = nil
      Order.transaction do
        # Row lock first: a second refund of the same order waits here, then sees this one and is refused below.
        order.lock!
        return Refund.find(id) if id && Refund.exists?(id: id)
        raise Api::Errors::Conflict.new("refund.not_paid", "Only a paid order can be refunded") unless held_minor(order).positive?
        settled = order.status.in?(%w[paid closed refunded])
        check_open!(order, amount_minor) unless settled
        # The refund is dated to the day the money goes back, not the day of the sale: the sale stays on its own day.
        day = shift&.business_day || order.branch.business_day_for(Time.current)
        raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if DayClose.locked?(order.branch_id, day)
        refunded = Refund.where(order_id: order.id).sum(:amount_minor)
        captured = Payment.where(order_id: order.id, status: "captured").sum(:amount_minor)
        if amount_minor <= 0 || refunded + amount_minor > captured
          # A part refunded order still reads paid in full, so the screens offer too much: say what is left.
          raise Api::Errors::Conflict.new("refund.too_much", "Refund exceeds what was paid: Rs #{Customers::Notify.rupees(captured - refunded)} is left to refund on #{order.label}",
                                          details: { refundable_minor: captured - refunded })
        end
        check_method!(order, method, amount_minor)
        refund = Refund.create!(id: id, order: order, branch_id: order.branch_id, payment_method: method, payment_account: method.payment_account, amount_minor: amount_minor,
                                reason: reason, by_membership_id: actor&.id, approved_by_membership_id: approver&.id, shift_id: shift&.id, business_day: day, refunded_at: Time.current)
        account = method.cash? && shift&.drawer_account ? shift.drawer_account : method.payment_account
        refund.update_column(:payment_account_id, account.id) if account
        account&.post!(kind: "refund", amount_minor: -amount_minor, business_day: refund.business_day, ref: refund, description: "Refund #{order.label}: #{reason}", by: actor, shift_id: shift&.id, branch_id: order.branch_id)
        if method.khata? && order.customer_id
          customer = Customer.lock.find(order.customer_id)
          customer.update!(balance_minor: customer.balance_minor - amount_minor)
          Finance::Journal.khata_refund!(refund) # khata has no payment account, so the journal is posted here
        end
        # Money refunded is not money owed (QA T8). On a settled order a part refund corrects the sale (a cold dish): the
        # order stays paid, nothing is due, and a reopen does not ask for it again; reports and the journal take the
        # refund off the sale. Money given back on an open order is owed again.
        order.paid_minor -= amount_minor unless settled
        # An open order handing back its excess stays open, even a zero-total one (a staff meal) refunded in full.
        full = settled && refunded + amount_minor >= captured
        if full
          order.paid_minor = 0 # nothing paid, nothing owed
          order.status = "refunded"
          OrderStatusEvent.create!(order: order, from_status: "paid", to_status: "refunded", membership_id: actor&.id, device_id: device&.id, reason: reason, occurred_at: Time.current)
          Orders::Story.record!(order, "cancelled", actor: actor, device: device, amount_before: order.total_minor, amount_after: 0, note: "refunded: #{reason}")
          # SPEC Return stock on cancellation: a completed order's ingredients come back when the setting is on; otherwise staff record waste.
          if order.stock_deducted_at
            if InventorySetting.current.return_on_cancel
              Stock::Deduction.return!(order, actor: actor, reason: "refund")
            else
              Stock::Deduction.waste!(order, reason: "refund: #{reason}")
            end
          end
        end
        # The same rule as pricing: a reopened order whose excess was refunded is paid, not stranded as partial.
        order.payment_status = Orders::Pricing.payment_status_for(order)
        order.save!
        # The customer's spend counted the order when it was first paid in full (paid_at); a part payment going back on an
        # order never completed was never counted.
        Customer.where(id: order.customer_id).update_all([ "net_spent_minor = net_spent_minor - ?", amount_minor ]) if order.customer_id && order.paid_at
        AuditLog.record(action: "refund", record: order, after: { amount_minor: amount_minor, method: method.code, reason: reason, full: full }, approved_by: approver&.user)
      end
      Realtime.order_changed(order)
      refund
    end
  end
end

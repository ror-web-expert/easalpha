module Payments
  # Refunds part or all of a paid order back through a payment method. Manager only.
  class Refunder
    def self.call(order, amount_minor:, method_code:, reason:, actor:, approver: nil, device: nil, shift: nil, id: nil)
      raise Api::Errors::Conflict.new("refund.not_paid", "Only a paid order can be refunded") unless order.paid_minor.positive?
      refunded = Refund.where(order_id: order.id).sum(:amount_minor)
      captured = Payment.where(order_id: order.id, status: "captured").sum(:amount_minor)
      raise Api::Errors::Conflict.new("refund.too_much", "Refund exceeds what was paid") if amount_minor <= 0 || refunded + amount_minor > captured
      method = PaymentMethod.active.find_by!(code: method_code)
      refund = nil
      Order.transaction do
        return Refund.find(id) if id && Refund.exists?(id: id)
        refund = Refund.create!(id: id, order: order, branch_id: order.branch_id, payment_method: method, payment_account: method.payment_account, amount_minor: amount_minor,
                                reason: reason, by_membership_id: actor&.id, approved_by_membership_id: approver&.id, shift_id: shift&.id, business_day: order.business_day || Date.current, refunded_at: Time.current)
        account = method.cash? && shift&.drawer_account ? shift.drawer_account : method.payment_account
        refund.update_column(:payment_account_id, account.id) if account
        account&.post!(kind: "refund", amount_minor: -amount_minor, business_day: refund.business_day, ref: refund, description: "Refund #{order.label}: #{reason}", by: actor, shift_id: shift&.id, branch_id: order.branch_id)
        if method.khata? && order.customer_id
          customer = Customer.lock.find(order.customer_id)
          customer.update!(balance_minor: customer.balance_minor - amount_minor)
        end
        order.paid_minor -= amount_minor
        full = refunded + amount_minor >= captured
        if full
          order.status = "refunded"
          order.payment_status = "refunded"
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
        else
          order.payment_status = "partial"
        end
        order.save!
        Customer.where(id: order.customer_id).update_all([ "net_spent_minor = net_spent_minor - ?", amount_minor ]) if order.customer_id
        AuditLog.record(action: "refund", record: order, after: { amount_minor: amount_minor, method: method.code, reason: reason, full: full }, approved_by: approver&.user)
      end
      Realtime.order_changed(order)
      refund
    end
  end
end

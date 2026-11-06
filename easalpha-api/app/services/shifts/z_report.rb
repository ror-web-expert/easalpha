module Shifts
  # The Z report: everything a cashier did between opening and closing a shift.
  module ZReport
    module_function

    def build(shift)
      payments = Payment.where(shift_id: shift.id, status: "captured")
      orders = Order.where(shift_id: shift.id)
      paid_orders = orders.where(status: %w[paid closed refunded])
      # A staff meal was never charged: it keeps its menu figures on the order but adds nothing to the sales (QA B8).
      charged = paid_orders.where(is_staff_meal: false)
      refunds = Refund.where(shift_id: shift.id)
      # Every kind of money that went through the drawer, so the Z report and the drawer account agree.
      cash = shift.cash_breakdown
      {
        shift_id: shift.id, business_day: shift.business_day, opened_at: shift.opened_at, closed_at: shift.closed_at || Time.current,
        cashier: Membership.unscoped.find_by(id: shift.cashier_membership_id)&.user&.name,
        orders: { total: orders.count, paid: paid_orders.count, voided: orders.where(status: "voided").count, open: orders.open.count, staff_meals: orders.where(is_staff_meal: true).count },
        sales: { gross_minor: charged.sum(:subtotal_minor), discount_minor: charged.sum(:discount_minor), service_charge_minor: charged.sum(:service_charge_minor),
                 tax_minor: charged.sum(:tax_minor), rounding_minor: charged.sum(:rounding_minor), tips_minor: charged.sum(:tip_minor), net_minor: charged.sum(:total_minor) },
        by_payment_method: payments.group(:method_code).sum(:amount_minor),
        by_order_type: charged.group(:order_type).sum(:total_minor),
        refunds: { count: refunds.count, amount_minor: refunds.sum(:amount_minor) },
        voids: { count: Void.joins(:order).where(orders: { shift_id: shift.id }).count, amount_minor: Void.joins(:order).where(orders: { shift_id: shift.id }).sum(:amount_minor) },
        discounts: { count: DiscountApplied.joins(:order).where(orders: { shift_id: shift.id, is_staff_meal: false }).count, amount_minor: charged.sum(:discount_minor) },
        cash: cash.merge(expected_minor: shift.closed_at ? shift.expected_cash_minor : cash[:expected_minor], counted_minor: shift.counted_cash_minor, over_short_minor: shift.over_short_minor),
        khata: { collected_minor: CustomerPayment.where(shift_id: shift.id, direction: "received").sum(:amount_minor), on_account_minor: payments.by_method_kind("khata").sum(:amount_minor) },
        movements: shift.cash_movements.order(:occurred_at).map { |m| { kind: m.kind, amount_minor: m.amount_minor, reason: m.reason, at: m.occurred_at } }
      }
    end
  end
end

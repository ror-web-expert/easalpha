module Shifts
  # The Z report: everything a cashier did between opening and closing a shift.
  module ZReport
    module_function

    def build(shift)
      payments = Payment.where(shift_id: shift.id, status: "captured")
      orders = Order.where(shift_id: shift.id)
      paid_orders = orders.where(status: %w[paid closed refunded])
      refunds = Refund.where(shift_id: shift.id)
      {
        shift_id: shift.id, business_day: shift.business_day, opened_at: shift.opened_at, closed_at: shift.closed_at || Time.current,
        cashier: Membership.unscoped.find_by(id: shift.cashier_membership_id)&.user&.name,
        orders: { total: orders.count, paid: paid_orders.count, voided: orders.where(status: "voided").count, open: orders.open.count, staff_meals: orders.where(is_staff_meal: true).count },
        sales: { gross_minor: paid_orders.sum(:subtotal_minor), discount_minor: paid_orders.sum(:discount_minor), service_charge_minor: paid_orders.sum(:service_charge_minor),
                 tax_minor: paid_orders.sum(:tax_minor), rounding_minor: paid_orders.sum(:rounding_minor), tips_minor: paid_orders.sum(:tip_minor), net_minor: paid_orders.sum(:total_minor) },
        by_payment_method: payments.group(:method_code).sum(:amount_minor),
        by_order_type: paid_orders.group(:order_type).sum(:total_minor),
        refunds: { count: refunds.count, amount_minor: refunds.sum(:amount_minor) },
        voids: { count: Void.joins(:order).where(orders: { shift_id: shift.id }).count, amount_minor: Void.joins(:order).where(orders: { shift_id: shift.id }).sum(:amount_minor) },
        discounts: { count: DiscountApplied.joins(:order).where(orders: { shift_id: shift.id }).count, amount_minor: paid_orders.sum(:discount_minor) },
        cash: { opening_minor: shift.opening_cash_minor, cash_sales_minor: payments.where(method_code: "cash").sum(:amount_minor),
                cash_in_minor: shift.cash_movements.where("amount_minor > 0").sum(:amount_minor), cash_out_minor: -shift.cash_movements.where("amount_minor < 0").sum(:amount_minor),
                expected_minor: shift.closed_at ? shift.expected_cash_minor : shift.expected_cash, counted_minor: shift.counted_cash_minor, over_short_minor: shift.over_short_minor },
        khata: { collected_minor: CustomerPayment.where(shift_id: shift.id, direction: "received").sum(:amount_minor), on_account_minor: payments.where(method_code: "khata").sum(:amount_minor) },
        movements: shift.cash_movements.order(:occurred_at).map { |m| { kind: m.kind, amount_minor: m.amount_minor, reason: m.reason, at: m.occurred_at } }
      }
    end
  end
end

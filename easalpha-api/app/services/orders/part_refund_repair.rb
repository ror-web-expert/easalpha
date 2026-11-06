module Orders
  # Orders part-refunded before 7 Nov 2026 still read "Partial" with a balance due: the refund lowered paid_minor, so a
  # settled sale looked unpaid by the refunded amount on its receipt and on reopening. Since then a part refund of a
  # settled order leaves paid_minor at the total (money given back is not money owed). This puts the old ones right:
  # a paid or closed order, fully paid before its refunds, refunded only in part, gets paid_minor = total and "paid".
  module PartRefundRepair
    module_function

    def run!(dry_run: true)
      candidates.filter_map do |o|
        captured = Payment.where(order_id: o.id, status: "captured").sum(:amount_minor)
        refunded = Refund.where(order_id: o.id).sum(:amount_minor)
        next unless captured >= o.total_minor && refunded.positive? && refunded < captured
        row = { order: o.label, business_day: o.business_day, total: o.total_minor, paid_was: o.paid_minor, captured: captured, refunded: refunded }
        unless dry_run
          o.update_columns(paid_minor: o.total_minor, payment_status: "paid", updated_at: Time.current)
          AuditLog.record(action: "update", record: o, before: { paid_minor: row[:paid_was], payment_status: "partial" }, after: { paid_minor: o.total_minor, payment_status: "paid", reason: "part refund repair" })
        end
        row
      end
    end

    def candidates
      Order.where(status: %w[paid closed], payment_status: "partial", unpaid_direct: false).where(id: Refund.select(:order_id)).order(:business_day, :created_at)
    end
  end
end

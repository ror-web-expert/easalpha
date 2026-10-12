module Orders
  # One-off repair for orders hit by the regular-discount bug fixed on 13 Oct 2026: saving an open order again worked
  # the regular discount out from the already-discounted amount, so its total rose after the till had taken payment
  # and the order stayed open as a part payment ("Paid Rs 1,253, Due Rs 0"). For each open order whose regular
  # discount differs from the right amount for its own tier, this puts the right amount back, reprices the order and,
  # when the payments now cover it, completes it as paid. Paid and closed orders are never touched.
  module RegularDiscountRepair
    module_function

    OPEN = %w[draft held placed preparing ready served dispatched].freeze

    # Returns one row per order looked at; with dry_run nothing is written.
    def run!(dry_run: true, actor: nil)
      Order.where(status: OPEN).where(id: DiscountApplied.where(kind: "regular").select(:order_id)).includes(:items, :discounts).order(:created_at).filter_map do |order|
        d = order.discounts.find { |x| x.kind == "regular" }
        tier = d && RegularDiscountTier.unscope(where: :archived_at).find_by(id: d.regular_discount_tier_id)
        next unless tier
        base = order.items.reject(&:cancelled?).sum { |i| i.line_subtotal_minor - Marketing::RegularDiscounts.product_discount(i) }
        right = tier.discount_for(base)
        next if right == d.amount_minor
        row = { order: order.label, order_id: order.id, business_day: order.business_day, customer: order.customer&.name, discount_was: d.amount_minor, discount_now: right,
                total_was: order.total_minor, paid: order.paid_minor }
        if dry_run
          row[:action] = "would correct"
        else
          Order.transaction do
            d.update!(value: BigDecimal(right.to_s) / 100)
            order.discounts.reset
            Pricing.recalculate!(order)
            Pricing.save_all!(order)
            order.reload
            Payments::Processor.new(order, actor: actor).finalize_paid! if order.payment_status == "paid" && order.status.in?(OPEN)
            AuditLog.record(action: "update", record: order, after: { repaired: "regular discount", discount_was_minor: row[:discount_was], discount_minor: right, total_minor: order.total_minor, status: order.reload.status })
          end
          row[:total_now] = order.total_minor
          row[:action] = order.status == "paid" ? "corrected and completed as paid" : "corrected; #{order.total_minor - order.paid_minor} still due"
        end
        row
      end
    end
  end
end

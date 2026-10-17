module Orders
  # One-off repair for orders hit by the regular-discount bug fixed on 13 Oct 2026: saving an open order again worked
  # the regular discount out from the already-discounted amount, so its total rose after the till had taken payment
  # and the order stayed open as a part payment ("Paid Rs 1,253, Due Rs 0"). For each open order whose regular
  # discount differs from the right amount for its own tier, this puts the right amount back, reprices the order and,
  # when the payments now cover it, completes it as paid. Paid and closed orders are never touched, and neither are
  # orders the till would no longer give the discount to (see applies_now?).
  module RegularDiscountRepair
    module_function

    OPEN = %w[draft held placed preparing ready served dispatched].freeze

    # Returns one row per order corrected (with dry_run, per order that would be, and nothing is written).
    def run!(dry_run: true, actor: nil)
      ids = Order.where(status: OPEN).where(id: DiscountApplied.where(kind: "regular").select(:order_id)).order(:created_at).pluck(:id)
      ids.filter_map do |id|
        Order.transaction do
          order = Order.lock(!dry_run).find(id) # while writing, a till saving the same order waits for the corrected one
          row = order.status.in?(OPEN) && correction(order)
          next unless row
          if dry_run
            row.merge(action: order.payment_status == "paid" ? "would correct and complete as paid" : "would correct; #{order.total_minor - order.paid_minor} still due")
          else
            Pricing.save_all!(order)
            order.reload
            Payments::Processor.new(order, actor: actor).finalize_paid! if order.payment_status == "paid"
            AuditLog.record(action: "update", record: order, after: { repaired: "regular discount", discount_was_minor: row[:discount_was], discount_minor: row[:discount_now], total_minor: order.total_minor, status: order.reload.status })
            row.merge(action: order.status == "paid" ? "corrected and completed as paid" : "corrected; #{order.total_minor - order.paid_minor} still due")
          end
        end
      end
    end

    # Puts the right discount on the order in memory and reprices it. Returns the row, or nil when there is nothing to
    # correct: the discount would not be given now, it is already right, the order is now below the tier's minimum (the
    # till would drop the discount, which is not this bug), or Pricing caps the new amount at what is left of the
    # order, which is what is stored already.
    def correction(order)
      d = order.discounts.find { |x| x.kind == "regular" }
      tier = d && RegularDiscountTier.find_by(id: d.regular_discount_tier_id)
      return unless tier && applies_now?(order, tier)
      right = tier.discount_for(Marketing::RegularDiscounts.base_for(order, tier))
      return if right <= 0 || right == (d.value * 100).round
      row = { order: order.label, order_id: order.id, business_day: order.business_day, customer: order.customer&.name, discount_was: d.amount_minor, total_was: order.total_minor, paid: order.paid_minor }
      d.value = BigDecimal(right.to_s) / 100
      Pricing.recalculate!(order)
      return if d.amount_minor == row[:discount_was]
      reround!(order)
      row.merge(discount_now: d.amount_minor, total_now: order.total_minor)
    end

    # The till would still give this tier's discount: regular discounts are on, the customer is a regular who is not
    # blocked, and the tier is active and does not exclude the order type. Recency is not checked again: the order
    # keeps the tier it was given when it was opened.
    def applies_now?(order, tier)
      Marketing::RegularDiscounts.enabled?(order.business) && Marketing::RegularDiscounts.regular?(order.customer, order.business) &&
        tier.active && tier.archived_at.nil? && !tier.excludes?(order)
    end

    # A cash payment rounds the order total to the cash step (Payments::Processor#apply_rounding!), and the till took
    # the rounded right total, so the corrected total is rounded the same way rather than keeping the old rounding.
    def reround!(order)
      step = order.business.setting("cash_rounding").to_i * 100
      return unless step.positive? && order.payments.any? { |p| p.status == "captured" && p.method_code == "cash" }
      order.cash_rounding_minor = 0
      Pricing.recalculate!(order)
      order.cash_rounding_minor = Rounding.round(order.total_minor, step) - order.total_minor
      Pricing.recalculate!(order)
    end
  end
end

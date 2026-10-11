module Marketing
  # SPEC Regular discounts: recency tiers. The till applies the best match automatically; the smallest day window wins,
  # customers who never ordered get nothing, exclusions work per tier plus a global blocked list.
  module RegularDiscounts
    module_function

    def blocked_ids(business = Current.business) = Array(business.setting("marketing.regular_discounts.blocked_customer_ids")).map(&:to_s)
    def enabled?(business = Current.business) = ActiveModel::Type::Boolean.new.cast(business.setting("marketing.regular_discounts.enabled"))

    # The tier the customer qualifies for right now, or nil.
    def tier_for(customer, order)
      return nil unless customer && !customer.is_walk_in && customer.last_order_at
      return nil if blocked_ids(order.business).include?(customer.id.to_s)
      days_since = ((Time.current - customer.last_order_at) / 86_400).floor
      RegularDiscountTier.active.order(:within_days).find { |t| days_since <= t.within_days && !t.excludes?(order) }
    end

    # Replaces the order's regular discount with the current best match (or removes it). Idempotent.
    def apply!(order)
      existing = order.discounts.select { |d| d.kind == "regular" }
      customer = order.customer_id && Customer.find_by(id: order.customer_id)
      tier = enabled?(order.business) ? tier_for(customer, order) : nil
      return if tier.nil? && existing.empty?
      existing.each(&:destroy!)
      order.discounts.reset
      return unless tier
      base = order.items.reject(&:cancelled?).reject { |i| tier.excluded_product_ids.include?(i.product_id) || (i.product && tier.excluded_category_ids.include?(i.product.category_id)) }
                  .sum { |i| i.line_subtotal_minor - i.line_discount_minor }
      amount = tier.discount_for(base)
      return if amount <= 0
      order.discounts.create!(kind: "regular", value: BigDecimal(amount.to_s) / 100, reason: "Regular discount: #{tier.name}", regular_discount_tier_id: tier.id)
      order.discounts.reset
    end

    def report(branch:, from:, to:)
      rows = DiscountApplied.joins(:order).where(kind: "regular", orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded] })
      tiers = RegularDiscountTier.unscope(where: :archived_at).index_by(&:id)
      by_tier = rows.group(:regular_discount_tier_id).pluck(Arel.sql("regular_discount_tier_id, count(*), sum(amount_minor)")).map do |tid, c, amt|
        t = tiers[tid]
        { tier_id: tid, tier: t&.name || "Removed tier", within_days: t&.within_days, kind: t&.kind, value: t&.value&.to_f, orders: c, amount_minor: amt.to_i }
      end.sort_by { |r| -r[:amount_minor] }
      { from: from, to: to, rows: by_tier, totals: { orders: rows.count, amount_minor: rows.sum(:amount_minor) }, tiers: RegularDiscountTier.active.order(:within_days).map { |t| MarketingSerializers.tier(t) } }
    end
  end
end

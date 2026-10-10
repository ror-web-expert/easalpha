module Stock
  # Deducts ingredients when an order is placed (decision 1), returns them on a void before cooking, and records an audit row per order.
  module Deduction
    module_function

    def enabled? = InventorySetting.current.deduct_stock_on_sale

    def deduct!(order, items: nil, actor: nil, packaging: true)
      return record!(order, "skipped", detail: { reason: "deduct_stock_on_sale is off" }) unless enabled?
      if items
        # Lines edited after sending (quantity raised) are reversed first, then deducted again at the new quantity.
        already = StockLedgerEntry.where(ref_line_id: items.map(&:id), reversed_by_entry_id: nil, reverses_entry_id: nil).distinct.pluck(:ref_line_id)
        return!(order, items: items.select { |i| already.include?(i.id) }, actor: actor, reason: "re-deduct", record: false) if already.any?
      end
      items ||= order.active_items
      section_default = StockSection.default_for(order.branch)
      entries, missing = [], []
      StockLedgerEntry.transaction do
        items.each do |item|
          moves = moves_for_item(item)
          if moves.nil?
            missing << item.name_snapshot
            next
          end
          moves.each do |m|
            r = Ledger.apply!(section: m[:section] || section_default, item: m[:stock_item], kind: "sale", quantity: -m[:quantity], actor: actor, ref: order, ref_line_id: item.id,
                              business_day: order.business_day, allow_negative: true, reason: "#{order.label} #{item.name_snapshot}")
            entries << r.entry
          end
          if (rc = recipe_cost_for(item))
            item.update_columns(recipe_cost_minor_snapshot: rc)
          end
        end
        if packaging
          PackagingRule.for(branch_id: order.branch_id, order_type: order.order_type).each do |rule|
            r = Ledger.apply!(section: section_default, item: rule.stock_item, kind: "packaging", quantity: -rule.quantity, actor: actor, ref: order, business_day: order.business_day, allow_negative: true, reason: "#{order.label} packaging")
            entries << r.entry
          end
        end
        order.update_columns(stock_deducted_at: Time.current) if entries.any?
      end
      status = missing.empty? ? "ok" : (entries.empty? ? "missing" : "partial")
      record!(order, status, entries: entries, detail: { missing: missing, entries: entries.size })
    rescue StandardError => e
      Rails.logger.error("[stock] deduction failed for order #{order.id}: #{e.class} #{e.message}")
      record!(order, "error", detail: { error: e.message })
    end

    # Reversal of the sale entries for the given items (or the whole order), used by void before cooking and by removed lines after send.
    def return!(order, items: nil, actor: nil, reason: "returned", record: true)
      scope = StockLedgerEntry.where(ref_table: "orders", ref_id: order.id, kind: %w[sale packaging], reversed_by_entry_id: nil, reverses_entry_id: nil)
      scope = scope.where(ref_line_id: items.map(&:id)) if items
      returned = []
      StockLedgerEntry.transaction do
        scope.find_each do |e|
          r = Ledger.apply!(section: e.stock_section, item: e.stock_item, kind: "sale_return", quantity: -e.quantity, actor: actor, ref: order, ref_line_id: e.ref_line_id,
                            business_day: order.branch.business_day_for(Time.current), allow_negative: true, reason: "#{reason}: #{e.reason}", reverses: e, unit_cost: e.unit_cost_minor)
          e.reversed_by_entry_id = r.entry.id
          e.save!
          returned << r.entry
        end
      end
      record!(order, "reversed", entries: returned, detail: { reason: reason, entries: returned.size }) if returned.any? && record
      returned
    end

    def waste!(order, reason:)
      record!(order, "waste", detail: { reason: reason })
    end

    # Ledger moves for one order item: [{stock_item, quantity (base), section}], or nil when the product has no recipe.
    def moves_for_item(item)
      moves = []
      if item.deal_id
        components = Array(item.deal_components)
        found_any = false
        components.each do |c|
          c = c.with_indifferent_access
          product = Product.find_by(id: c[:product_id]) or next
          recipe = recipe_for(product, c[:variant_id])
          next unless recipe
          found_any = true
          moves.concat(recipe_moves(recipe, (c[:quantity].presence || 1).to_d * item.quantity))
        end
        return nil unless found_any
      elsif item.product_id
        recipe = recipe_for(item.product, item.variant_id)
        return nil unless recipe
        moves.concat(recipe_moves(recipe, item.quantity))
      else
        return nil # open items carry no recipe
      end
      item.modifiers.each do |m|
        mod = Modifier.find_by(id: m.modifier_id)
        next unless mod&.stock_item_id && mod.quantity
        qty = mod.stock_unit ? mod.stock_unit.convert(mod.quantity, to: mod.stock_item.base_unit) : mod.quantity
        moves << { stock_item: mod.stock_item, quantity: qty * m.quantity * item.quantity, section: nil }
      end
      moves
    end

    def recipe_for(product, variant_id)
      (variant_id && Recipe.active.find_by(product_id: product.id, variant_id: variant_id)) || Recipe.active.find_by(product_id: product.id, variant_id: nil)
    end

    def recipe_moves(recipe, portions)
      per = BigDecimal(portions.to_s) / recipe.yield_qty
      recipe.lines.includes(:stock_item).map { |l| { stock_item: l.stock_item, quantity: (l.gross_base_quantity * per).round(3), section: recipe.source_section } }
    end

    def recipe_cost_for(item)
      return nil unless item.product_id
      recipe = recipe_for(item.product, item.variant_id)
      recipe && (recipe.unit_cost_minor * item.quantity).round
    end

    def record!(order, status, entries: [], detail: {})
      DeductionAudit.create!(order: order, status: status, ledger_entry_ids: entries.map(&:id), detail: detail, checked_at: Time.current)
    end
  end
end

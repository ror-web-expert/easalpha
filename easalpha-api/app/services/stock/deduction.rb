module Stock
  # Deducts ingredients when an order is placed (decision 1), returns them on a void before cooking, and records an audit row per order.
  module Deduction
    module_function

    def enabled? = InventorySetting.current.deduct_stock_on_sale

    # `packaging: false` (a re-deduct after an edit) leaves the order-level packaging rules alone, since the order was
    # already charged for them; a line's own consumables always go with the line, at its current quantity.
    def deduct!(order, items: nil, actor: nil, packaging: true)
      return record!(order, "skipped", detail: { reason: "deduct_stock_on_sale is off" }) unless enabled?
      items ||= order.active_items
      section_default = StockSection.default_for(order.branch)
      entries, missing = [], []
      # Live movements of this order, [line, item, section, kind] => quantity. A line whose movements no longer
      # match what its quantity calls for (edited after the sale, or a re-deduct that failed half way) is reversed
      # and done again; a line that matches is skipped, so a retry never doubles (SPEC: never twice).
      live = Hash.new(BigDecimal("0"))
      StockLedgerEntry.where(ref_table: "orders", ref_id: order.id, kind: %w[sale packaging], reversed_by_entry_id: nil, reverses_entry_id: nil)
                      .pluck(:ref_line_id, :stock_item_id, :stock_section_id, :kind, :quantity).each { |l, i, s, k, q| live[[ l, i, s, k ]] += q }
      StockLedgerEntry.transaction do
        items.each do |item|
          # SPEC Order Inventory: consumables set per order type and variant on the product, charged with the sale.
          consumables = item.product_id ? OrderTypeConsumable.for_line(product_id: item.product_id, variant_id: item.variant_id, order_type: order.order_type) : []
          moves = moves_for_item(item)
          missing << item.name_snapshot if moves.nil?
          merged = moves ? merge_moves(moves, section_default) : []
          wanted = Hash.new(BigDecimal("0"))
          consumables.each { |c| wanted[[ item.id, c.stock_item_id, section_default.id, "packaging" ]] += -(c.base_quantity * item.quantity) }
          merged.each { |m| wanted[[ item.id, m[:stock_item].id, m[:section].id, "sale" ]] += -m[:quantity] }
          have = live.select { |k, _| k[0] == item.id }
          if have.any? && !same_moves?(have, wanted)
            return!(order, items: [ item ], actor: actor, reason: "re-deduct", record: false)
            have.each_key { |k| live.delete(k) }
          end
          consumables.each do |c|
            key = [ item.id, c.stock_item_id, section_default.id, "packaging" ]
            next if live.key?(key)
            r = Ledger.apply!(section: section_default, item: c.stock_item, kind: "packaging", quantity: -(c.base_quantity * item.quantity), actor: actor, ref: order, ref_line_id: item.id,
                              business_day: order.business_day, allow_negative: true, reason: "#{order.label} #{item.name_snapshot} consumables")
            entries << r.entry
            live[key] += r.entry.quantity
          end
          merged.each do |m|
            key = [ item.id, m[:stock_item].id, m[:section].id, "sale" ]
            next if live.key?(key)
            r = Ledger.apply!(section: m[:section], item: m[:stock_item], kind: "sale", quantity: -m[:quantity], actor: actor, ref: order, ref_line_id: item.id,
                              business_day: order.business_day, allow_negative: true, reason: "#{order.label} #{item.name_snapshot}")
            entries << r.entry
            live[key] += r.entry.quantity
          end
          if (rc = recipe_cost_for(item))
            item.update_columns(recipe_cost_minor_snapshot: rc)
          end
        end
        if packaging
          PackagingRule.for(branch_id: order.branch_id, order_type: order.order_type).each do |rule|
            key = [ nil, rule.stock_item_id, section_default.id, "packaging" ]
            next if live.key?(key)
            r = Ledger.apply!(section: section_default, item: rule.stock_item, kind: "packaging", quantity: -rule.quantity, actor: actor, ref: order, business_day: order.business_day, allow_negative: true, reason: "#{order.label} packaging")
            entries << r.entry
            live[key] += r.entry.quantity
          end
        end
        Finance::Journal.stock_entries!(entries, ref: order, description: "Cost of goods #{order.label}", business_day: order.business_day) if entries.any?
      end
      # The stamp means "checked", not "moved": an order whose products have no recipe is done too, so the safety net
      # stops picking it up. Only a failure (below) and deduction being off leave the stamp empty.
      order.update_columns(stock_deducted_at: Time.current)
      status = missing.empty? ? "ok" : (entries.empty? ? "missing" : "partial")
      record!(order, status, entries: entries, detail: { missing: missing, entries: entries.size })
    rescue StandardError => e
      Rails.logger.error("[stock] deduction failed for order #{order.id}: #{e.class} #{e.message}")
      # A failed re-deduct of an edited order must not keep the stamp from its first deduction: the safety net retries
      # and deduct! skips whatever already moved.
      order.update_columns(stock_deducted_at: nil) if order.stock_deducted_at
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
        Finance::Journal.stock_entries!(returned, ref: order, description: "Stock returned #{order.label}: #{reason}", business_day: order.branch.business_day_for(Time.current)) if returned.any?
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

    # The ledger keeps nine decimals, so the comparison does too.
    def same_moves?(have, wanted)
      have.transform_values { |q| q.round(9) } == wanted.transform_values { |q| q.round(9) }
    end

    # One movement per item and section, so a recipe that lists an ingredient twice still writes one unique row.
    def merge_moves(moves, section_default)
      moves.group_by { |m| [ m[:stock_item].id, (m[:section] || section_default).id ] }.map do |_, ms|
        { stock_item: ms.first[:stock_item], section: ms.first[:section] || section_default, quantity: ms.sum { |m| m[:quantity] } }
      end
    end

    def recipe_for(product, variant_id)
      (variant_id && Recipe.active.find_by(product_id: product.id, variant_id: variant_id)) || Recipe.active.find_by(product_id: product.id, variant_id: nil)
    end

    def recipe_moves(recipe, portions)
      per = BigDecimal(portions.to_s) / recipe.yield_qty
      recipe.lines.includes(:stock_item).map { |l| { stock_item: l.stock_item, quantity: (l.gross_base_quantity * per), section: recipe.source_section } }
    end

    def recipe_cost_for(item)
      return nil unless item.product_id
      recipe = recipe_for(item.product, item.variant_id)
      recipe && (recipe.unit_cost_minor * item.quantity).round
    end

    # One audit row per outcome: a sweep that finds the same thing again (no recipe, the same error) returns the
    # row it already wrote instead of adding one every ten minutes.
    def record!(order, status, entries: [], detail: {})
      last = DeductionAudit.where(order_id: order.id).order(checked_at: :desc).first
      return last if last && entries.empty? && last.status == status && last.ledger_entry_ids.empty? && last.detail == detail.as_json
      DeductionAudit.create!(order: order, status: status, ledger_entry_ids: entries.map(&:id), detail: detail, checked_at: Time.current)
    end
  end
end

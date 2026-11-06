module Stock
  # Deducts ingredients when an order is completed (decision 1), returns them on a void, a refund or a removed line,
  # keeps the ledger in step with a completed order that is reopened and edited, and records an audit row per outcome.
  module Deduction
    module_function

    def enabled? = InventorySetting.current.deduct_stock_on_sale

    # The order's sale and packaging rows that still stand (one per line, item, section and kind: a unique index).
    def live_rows(order) = StockLedgerEntry.where(ref_table: "orders", ref_id: order.id, kind: %w[sale packaging], reversed_by_entry_id: nil, reverses_entry_id: nil)
    def moved?(order) = live_rows(order).exists?

    # The day deductions and corrections are written to: the day the order was sold, unless its stock or the day itself
    # has been locked since (the safety net catching up, a reopened order of an earlier day), then today.
    def stock_day(order)
      today = order.branch.business_day_for(Time.current)
      day = order.business_day
      return today if day.nil? || InventorySetting.current.locked?(day) || DayClose.locked?(order.branch_id, day)
      day
    end

    # Brings the order's stock rows in step with its lines. Each line keeps stock_quantity, the quantity its rows were
    # written for (review of 6 Nov, stock#1, #2, #8, #9):
    # - a line with no rows and no stock_quantity is deducted at its quantity with today's recipe and consumables;
    # - a line whose quantity moved since (a reopened order edited) moves by the difference only: a raise takes the
    #   added portions at today's recipe, a lower gives back its share of what was taken, and the portions already sold
    #   keep what they were made of even when the recipe was edited or archived since;
    # - a line in step is left alone, so Retry and the safety net never undo a correct sale;
    # - a removed line that still holds rows gives them back, whatever happened to the order's stamp.
    # Only one live row may exist per key, so a corrected row is swapped (sale_return of the old, a new row of the new
    # total), both on the same day, so the day shows only the difference. `packaging: false` (an edit) leaves the
    # order-level packaging rules alone, since the order was charged for them; `fill_missing` (Retry) deducts a line
    # that found no recipe when it was checked, now that one may exist.
    def deduct!(order, items: nil, actor: nil, packaging: true, fill_missing: false)
      return record!(order, "skipped", detail: { reason: "deduct_stock_on_sale is off" }) unless enabled?
      was_checked = order.stock_deducted_at.present?
      lines = items || OrderItem.where(order_id: order.id).includes(:modifiers, :product).to_a
      section_default = StockSection.default_for(order.branch)
      day = stock_day(order)
      entries, missing = [], []
      StockLedgerEntry.transaction do
        rows = live_rows(order).includes(:stock_section, :stock_item).to_a.group_by(&:ref_line_id)
        lines.each do |item|
          have = rows[item.id] || []
          if item.cancelled?
            next if have.empty?
            entries.concat(return_rows!(order, have, actor: actor, reason: "removed", day: day))
            item.update_columns(stock_quantity: nil)
            next
          end
          on = item.stock_quantity
          if have.empty? && (on.nil? || fill_missing)
            entries.concat(take!(order, item, item.quantity, have, section_default, actor: actor, day: day, missing: missing))
          elsif on.nil?
            # Rows written before lines kept their quantity: taken to match it, never undone.
          elsif item.quantity > on
            entries.concat(take!(order, item, item.quantity - on, have, section_default, actor: actor, day: day, missing: missing))
          elsif item.quantity < on
            entries.concat(have.flat_map { |row| swap!(order, row, (row.quantity * item.quantity / on).round(9), actor: actor, day: day, reason: "#{order.label} #{item.name_snapshot} lowered") })
            missing << item.name_snapshot if have.empty?
          else
            # In step. A line that took nothing when it was checked (no recipe then) still shows as missing.
            missing << item.name_snapshot if have.empty?
            next
          end
          item.update_columns(stock_quantity: item.quantity)
          if (rc = recipe_cost_for(item))
            item.update_columns(recipe_cost_minor_snapshot: rc)
          end
        end
        if packaging
          taken = (rows[nil] || []).map { |r| [ r.stock_item_id, r.stock_section_id ] }
          PackagingRule.for(branch_id: order.branch_id, order_type: order.order_type).each do |rule|
            next if taken.include?([ rule.stock_item_id, section_default.id ])
            entries << Ledger.apply!(section: section_default, item: rule.stock_item, kind: "packaging", quantity: -rule.quantity, actor: actor, ref: order, business_day: day, allow_negative: true, reason: "#{order.label} packaging").entry
          end
        end
        Finance::Journal.stock_entries!(entries, ref: order, description: "Cost of goods #{order.label}", business_day: day) if entries.any?
      end
      # The stamp means "checked", not "moved": an order whose products have no recipe is done too, so the safety net
      # stops picking it up. Only a failure (below) and deduction being off leave the stamp empty.
      order.update_columns(stock_deducted_at: Time.current)
      # An edit that changed nothing for stock (a note, a price) leaves no audit row behind.
      last = DeductionAudit.where(order_id: order.id).order(checked_at: :desc).first
      return last if last && was_checked && entries.empty?
      # The order as it now stands: missing when no line took stock, partial when only some lines found a recipe.
      status = missing.empty? ? "ok" : (moved?(order) ? "partial" : "missing")
      record!(order, status, entries: entries, detail: { missing: missing.uniq, entries: entries.size })
    rescue StandardError => e
      Rails.logger.error("[stock] deduction failed for order #{order.id}: #{e.class} #{e.message}")
      # Nothing of a failed run stays (one transaction), and every line keeps the quantity its rows stand for: the
      # cleared stamp sends the order to the safety net (or to the next completion), which finishes the job.
      order.update_columns(stock_deducted_at: nil) if order.stock_deducted_at
      record!(order, "error", detail: { error: e.message })
    end

    # Takes `portions` more of a line: today's recipe, modifiers and the line's consumables for those portions, added to
    # whatever row the line already holds for the same item and section.
    def take!(order, item, portions, have, section_default, actor:, day:, missing:)
      moves = moves_for_item(item, portions)
      missing << item.name_snapshot if moves.nil?
      wanted = Hash.new(BigDecimal("0"))
      if item.product_id
        OrderTypeConsumable.for_line(product_id: item.product_id, variant_id: item.variant_id, order_type: order.order_type).each do |c|
          wanted[[ c.stock_item, section_default, "packaging" ]] += -(c.base_quantity * portions)
        end
      end
      merge_moves(moves || [], section_default).each { |m| wanted[[ m[:stock_item], m[:section], "sale" ]] += -m[:quantity] }
      wanted.flat_map do |(stock_item, section, kind), qty|
        next [] if qty.zero?
        row = have.find { |r| r.stock_item_id == stock_item.id && r.stock_section_id == section.id && r.kind == kind }
        reason = kind == "packaging" ? "#{order.label} #{item.name_snapshot} consumables" : "#{order.label} #{item.name_snapshot}"
        next swap!(order, row, row.quantity + qty, actor: actor, day: day, reason: reason) if row
        [ Ledger.apply!(section: section, item: stock_item, kind: kind, quantity: qty, actor: actor, ref: order, ref_line_id: item.id, business_day: day, allow_negative: true, reason: reason).entry ]
      end
    end

    # Replaces a live row with one of a new quantity: the old row comes back as a sale return at its own cost, the new
    # one goes out at today's average, both on `day`.
    def swap!(order, row, quantity, actor:, day:, reason:)
      back = return_rows!(order, [ row ], actor: actor, reason: "corrected", day: day)
      return back if quantity.zero?
      back + [ Ledger.apply!(section: row.stock_section, item: row.stock_item, kind: row.kind, quantity: quantity, actor: actor, ref: order, ref_line_id: row.ref_line_id,
                             business_day: day, allow_negative: true, reason: reason).entry ]
    end

    # Sale returns for live rows, linked to them, at their own cost. The caller books the journal.
    def return_rows!(order, rows, actor:, reason:, day:)
      rows.map do |e|
        r = Ledger.apply!(section: e.stock_section, item: e.stock_item, kind: "sale_return", quantity: -e.quantity, actor: actor, ref: order, ref_line_id: e.ref_line_id,
                          business_day: day, allow_negative: true, reason: "#{reason}: #{e.reason}", reverses: e, unit_cost: e.unit_cost_minor)
        e.update!(reversed_by_entry_id: r.entry.id)
        r.entry
      end
    end

    # Reversal of the sale entries for the given items (or the whole order), used by a void before cooking and a refund,
    # dated today: the stock comes back now.
    def return!(order, items: nil, actor: nil, reason: "returned", record: true, business_day: nil)
      day = business_day || order.branch.business_day_for(Time.current)
      scope = live_rows(order)
      scope = scope.where(ref_line_id: items.map(&:id)) if items
      returned = []
      StockLedgerEntry.transaction do
        returned = return_rows!(order, scope.includes(:stock_section, :stock_item).to_a, actor: actor, reason: reason, day: day)
        OrderItem.where(id: returned.map(&:ref_line_id).compact.uniq).update_all(stock_quantity: nil) if returned.any?
        Finance::Journal.stock_entries!(returned, ref: order, description: "Stock returned #{order.label}: #{reason}", business_day: day) if returned.any?
      end
      record!(order, "reversed", entries: returned, detail: { reason: reason, entries: returned.size }) if returned.any? && record
      returned
    end

    def waste!(order, reason:)
      record!(order, "waste", detail: { reason: reason })
    end

    # Ledger moves for `portions` of one order item: [{stock_item, quantity (base), section}], or nil when the product
    # has no recipe.
    def moves_for_item(item, portions = item.quantity)
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
          moves.concat(recipe_moves(recipe, (c[:quantity].presence || 1).to_d * portions))
        end
        return nil unless found_any
      elsif item.product_id
        recipe = recipe_for(item.product, item.variant_id)
        return nil unless recipe
        moves.concat(recipe_moves(recipe, portions))
      else
        return nil # open items carry no recipe
      end
      item.modifiers.each do |m|
        mod = Modifier.find_by(id: m.modifier_id)
        next unless mod&.stock_item_id && mod.quantity
        qty = mod.stock_unit ? mod.stock_unit.convert(mod.quantity, to: mod.stock_item.base_unit) : mod.quantity
        moves << { stock_item: mod.stock_item, quantity: qty * m.quantity * portions, section: nil }
      end
      moves
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

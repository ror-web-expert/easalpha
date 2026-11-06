module Stock
  # The one place stock moves. Locks the level row, writes a ledger entry with before and after, updates the level
  # and the item's weighted average cost on receipts. Quantity is signed and in base units.
  module Ledger
    module_function

    Result = Struct.new(:entry, :level, keyword_init: true)

    # Entry kinds that carry a price of their own and so move the average; everything else is written at the average
    # of its moment.
    COSTED_KINDS = %w[receive production_in adjustment sale_return opening].freeze

    def apply!(section:, item:, kind:, quantity:, actor: nil, ref: nil, business_day: nil, occurred_at: Time.current,
               unit_cost: nil, reason: nil, allow_negative: true, completed_by: nil, reverses: nil, ref_table: nil, ref_id: nil, ref_line_id: nil)
      quantity = BigDecimal(quantity.to_s)
      StockLevel.transaction do
        level = StockLevel.lock.find_or_create_by!(stock_section_id: section.id, stock_item_id: item.id)
        before = level.quantity
        after = before + quantity
        if after.negative? && !allow_negative
          raise Api::Errors::Conflict.new("stock.below_zero", "#{item.name} would go to #{after.to_s('F')} #{item.base_unit.code} in #{section.name}. Manual moves below zero are off.")
        end
        cost = unit_cost.nil? ? item.avg_cost_minor_per_base : BigDecimal(unit_cost.to_s)
        repriced = quantity.positive? && unit_cost
        item.update_columns(avg_cost_minor_per_base: weighted_average(item, before, cost, quantity)) if repriced
        value = (quantity * cost).round
        entry = StockLedgerEntry.create!(
          branch_id: section.branch_id, stock_section: section, stock_item: item, kind: kind, quantity: quantity,
          before_qty: before, after_qty: after, unit_cost_minor: cost, value_minor: value, reason: reason,
          business_day: business_day || section.branch.business_day_for(occurred_at), occurred_at: occurred_at,
          ref_table: ref_table || ref&.class&.table_name, ref_id: ref_id || ref&.id, ref_line_id: ref_line_id, punched_by_membership_id: actor&.id,
          completed_by_membership_id: completed_by&.id || actor&.id, reverses_entry_id: reverses&.id
        )
        level.update!(quantity: after, value_minor: (after * item.avg_cost_minor_per_base).round)
        # A new average changes what every section's stock of this item is worth, not only the section that received.
        revalue!(item) if repriced
        Alerts.negative_stock(item, section, after) if after.negative? && !before.negative?
        Alerts.low_stock(item, item.total_quantity) if item.minimum_qty.positive? && after <= item.minimum_qty && before > item.minimum_qty
        Result.new(entry: entry, level: level)
      end
    end

    def weighted_average(item, on_hand, cost, quantity)
      total_qty = StockLevel.where(stock_item_id: item.id).sum(:quantity)
      total_qty = 0 if total_qty.negative?
      return cost if total_qty.zero?
      ((total_qty * item.avg_cost_minor_per_base) + (quantity * cost)) / (total_qty + quantity)
    end

    # Inserts a reversing row for an entry and links the two, then takes the undone entry out of the item's average.
    # recompute: false leaves the replay to the caller, which reverses a whole document and replays each item once.
    def reverse!(entry, actor:, reason: nil, recompute: true)
      r = apply!(section: entry.stock_section, item: entry.stock_item, kind: entry.kind, quantity: -entry.quantity, actor: actor, reason: reason || "reversal",
                 ref_table: entry.ref_table, ref_id: entry.ref_id, ref_line_id: entry.ref_line_id, unit_cost: entry.unit_cost_minor, reverses: entry, business_day: entry.stock_section.branch.business_day_for(Time.current))
      entry.reversed_by_entry_id = r.entry.id
      entry.save!
      recompute_average!(entry.stock_item) if recompute
      r
    end

    # Reverses a voided document's rows, then replays each item's average once (not once per row). Returns the
    # reversing rows and the revaluation: how much the new averages changed the stock on hand beyond what the reversed
    # rows themselves carried, which the journal books against Inventory so it keeps matching the valuation.
    def reverse_all!(entries, actor:, reason: nil)
      items = entries.map(&:stock_item).uniq(&:id)
      before = items.to_h { |i| [ i.id, value_of_item(i) ] }
      rows = entries.map { |e| reverse!(e, actor: actor, reason: reason, recompute: false).entry }
      items.each { |i| recompute_average!(i.reload) }
      carried = rows.group_by(&:stock_item_id).transform_values { |rs| rs.sum(&:value_minor) }
      [ rows, items.sum { |i| value_of_item(i) - before[i.id] - carried[i.id].to_i } ]
    end

    def value_of_item(item) = Reports::Stock.value_of(StockLevel.where(stock_item_id: item.id))

    # A moving average depends on the order receipts and sales came in, so once a receipt is cancelled the only
    # faithful figure is a replay: the live entries (neither reversed nor reversing) in order, the priced kinds folded
    # in at their stored cost, exactly as apply! did the first time. A positive adjustment entered without a cost was
    # stored at the average of its moment and is folded in at that figure, which can leave a small drift; the
    # alternative, a full repricing of history, would change ledger rows that are insert-only.
    #
    # The quantity on hand before each row comes from one window sum in the database, so only the priced rows (a few
    # hundred receipts against a staple's many thousand sales) come back to be folded here.
    def recompute_average!(item)
      live = StockLedgerEntry.where(stock_item_id: item.id, reversed_by_entry_id: nil, reverses_entry_id: nil)
                             .select(:id, :quantity, :unit_cost_minor, :kind, :occurred_at, :created_at,
                                     Arel.sql("COALESCE(SUM(quantity) OVER (ORDER BY occurred_at, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS on_hand_before"))
      priced = StockLedgerEntry.unscoped.from(live, :t).where("t.quantity > 0 AND t.kind IN (?)", COSTED_KINDS).order(Arel.sql("t.occurred_at, t.created_at, t.id"))
                               .pluck(Arel.sql("t.quantity"), Arel.sql("t.unit_cost_minor"), Arel.sql("t.on_hand_before"))
      avg = nil
      priced.each do |qty, cost, on_hand|
        base = [ on_hand, 0 ].max
        avg = avg.nil? || base.zero? ? cost : ((base * avg) + (qty * cost)) / (base + qty)
      end
      item.update_columns(avg_cost_minor_per_base: avg) if avg # nothing priced left: the last known average stands
      revalue!(item)
    end

    # Every level of the item is worth quantity times the one average cost; the cached value_minor follows it.
    def revalue!(item)
      StockLevel.where(stock_item_id: item.id).update_all([ "value_minor = round(quantity * ?)", item.avg_cost_minor_per_base ])
    end
  end
end

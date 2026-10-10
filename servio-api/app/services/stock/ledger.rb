module Stock
  # The one place stock moves. Locks the level row, writes a ledger entry with before and after, updates the level
  # and the item's weighted average cost on receipts. Quantity is signed and in base units.
  module Ledger
    module_function

    Result = Struct.new(:entry, :level, keyword_init: true)

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
        if quantity.positive? && unit_cost
          item.update_columns(avg_cost_minor_per_base: weighted_average(item, before, cost, quantity))
        end
        value = (quantity * cost).round
        entry = StockLedgerEntry.create!(
          branch_id: section.branch_id, stock_section: section, stock_item: item, kind: kind, quantity: quantity,
          before_qty: before, after_qty: after, unit_cost_minor: cost, value_minor: value, reason: reason,
          business_day: business_day || section.branch.business_day_for(occurred_at), occurred_at: occurred_at,
          ref_table: ref_table || ref&.class&.table_name, ref_id: ref_id || ref&.id, ref_line_id: ref_line_id, punched_by_membership_id: actor&.id,
          completed_by_membership_id: completed_by&.id || actor&.id, reverses_entry_id: reverses&.id
        )
        level.update!(quantity: after, value_minor: (after * item.avg_cost_minor_per_base).round)
        Alerts.negative_stock(item, section, after) if after.negative? && !before.negative?
        Result.new(entry: entry, level: level)
      end
    end

    def weighted_average(item, on_hand, cost, quantity)
      total_qty = StockLevel.where(stock_item_id: item.id).sum(:quantity)
      total_qty = 0 if total_qty.negative?
      return cost if total_qty.zero?
      ((total_qty * item.avg_cost_minor_per_base) + (quantity * cost)) / (total_qty + quantity)
    end

    # Inserts a reversing row for an entry and links the two.
    def reverse!(entry, actor:, reason: nil)
      r = apply!(section: entry.stock_section, item: entry.stock_item, kind: entry.kind, quantity: -entry.quantity, actor: actor, reason: reason || "reversal",
                 ref_table: entry.ref_table, ref_id: entry.ref_id, ref_line_id: entry.ref_line_id, unit_cost: entry.unit_cost_minor, reverses: entry, business_day: entry.stock_section.branch.business_day_for(Time.current))
      entry.reversed_by_entry_id = r.entry.id
      entry.save!
      r
    end
  end
end

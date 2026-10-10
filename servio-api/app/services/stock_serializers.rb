module StockSerializers
  module_function

  def unit(u) = { id: u.id, code: u.code, name: u.name, kind: u.kind, factor_to_base: u.factor_to_base.to_s, is_base: u.is_base, archived_at: u.archived_at }

  def section(s) = { id: s.id, branch_id: s.branch_id, name: s.name, sort_order: s.sort_order, is_default: s.is_default, archived_at: s.archived_at }

  def item(i, levels: nil)
    h = { id: i.id, name: i.name, name_ur: i.name_ur, sku: i.sku, category: i.category, barcode: i.barcode, base_unit: unit(i.base_unit), purchase_unit: i.purchase_unit && unit(i.purchase_unit),
          minimum_qty: i.minimum_qty.to_s, reorder_qty: i.reorder_qty.to_s, avg_cost_minor_per_base: i.avg_cost_minor_per_base.to_s, track_expiry: i.track_expiry, is_packaging: i.is_packaging,
          archived_at: i.archived_at, created_at: i.created_at }
    if levels
      h[:levels] = levels.map { |l| { section_id: l.stock_section_id, quantity: l.quantity.to_s, value_minor: l.value_minor } }
      h[:quantity] = levels.sum(&:quantity).to_s
      h[:value_minor] = levels.sum(&:value_minor)
    end
    h
  end

  def document(d, full: false)
    h = { id: d.id, number: d.number, label: d.label, kind: d.kind, status: d.status, branch_id: d.branch_id, from_section_id: d.from_section_id, to_section_id: d.to_section_id,
          supplier_id: d.supplier_id, goods_receipt_id: d.goods_receipt_id, reason: d.reason, invoice_ref: d.invoice_ref, note: d.note, business_day: d.business_day,
          posted_at: d.posted_at, cancelled_at: d.cancelled_at, by_membership_id: d.by_membership_id, posted_by_membership_id: d.posted_by_membership_id, created_at: d.created_at,
          line_count: d.lines.size, total_cost_minor: d.lines.sum { |l| l.unit_cost_minor ? (BigDecimal(l.unit_cost_minor.to_s) * l.quantity).round : 0 } }
    h[:lines] = d.lines.map { |l| line(l) } if full
    h
  end

  def line(l)
    { id: l.id, stock_item_id: l.stock_item_id, item_name: l.stock_item.name, unit_id: l.unit_id, unit_code: l.unit.code, quantity: l.quantity.to_s, base_quantity: l.base_quantity.to_s,
      unit_cost_minor: l.unit_cost_minor, batch_no: l.batch_no, expires_on: l.expires_on, counted_qty: l.counted_qty&.to_s, expected_qty: l.expected_qty&.to_s, note: l.note }
  end

  def ledger_entry(e)
    { id: e.id, business_day: e.business_day, occurred_at: e.occurred_at, kind: e.kind, section_id: e.stock_section_id, section_name: e.stock_section&.name, stock_item_id: e.stock_item_id,
      item_name: e.stock_item&.name, unit_code: e.stock_item&.base_unit&.code, quantity: e.quantity.to_s, before_qty: e.before_qty.to_s, after_qty: e.after_qty.to_s,
      unit_cost_minor: e.unit_cost_minor.to_s, value_minor: e.value_minor, reason: e.reason, ref_table: e.ref_table, ref_id: e.ref_id, ref_line_id: e.ref_line_id, punched_by_membership_id: e.punched_by_membership_id,
      completed_by_membership_id: e.completed_by_membership_id, reversed_by_entry_id: e.reversed_by_entry_id, reverses_entry_id: e.reverses_entry_id }
  end

  def settings(s)
    { day_lock_date: s.day_lock_date, counting_open: s.counting_open, allow_manual_below_zero: s.allow_manual_below_zero, return_on_cancel: s.return_on_cancel, weight_display: s.weight_display,
      volume_display: s.volume_display, food_cost_target_percent: s.food_cost_target_percent.to_f, require_recipe_to_live: s.require_recipe_to_live, deduct_stock_on_sale: s.deduct_stock_on_sale }
  end
end

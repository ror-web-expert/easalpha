module RecipeSerializers
  module_function

  def recipe(r, full: false)
    h = { id: r.id, name: r.name, product_id: r.product_id, variant_id: r.variant_id, product_name: r.product&.name, variant_name: r.variant&.name, output_stock_item_id: r.output_stock_item_id,
          output_item_name: r.output_stock_item&.name, yield_qty: r.yield_qty.to_s, yield_unit: r.yield_unit && StockSerializers.unit(r.yield_unit), source_section_id: r.source_section_id,
          cost_minor: r.cost_minor, unit_cost_minor: r.unit_cost_minor, is_sub_recipe: r.sub_recipe?, line_count: r.lines.size, notes: r.notes, archived_at: r.archived_at, updated_at: r.updated_at }
    h[:food_cost] = Recipes::Costing.food_cost(r) if r.product
    h[:lines] = r.lines.map { |l| line(l) } if full
    h
  end

  def line(l)
    { id: l.id, stock_item_id: l.stock_item_id, item_name: l.stock_item.name, unit_id: l.unit_id, unit_code: l.unit.code, quantity: l.quantity.to_s, base_quantity: l.base_quantity.to_s,
      base_unit_code: l.stock_item.base_unit.code, waste_percent: l.waste_percent.to_f, cost_minor: l.cost_minor, sort_order: l.sort_order }
  end

  def batch(b)
    { id: b.id, recipe_id: b.recipe_id, recipe_name: b.recipe.name, stock_document_id: b.stock_document_id, document_label: b.stock_document&.label, stock_section_id: b.stock_section_id,
      quantity_produced: b.quantity_produced.to_s, cost_minor: b.cost_minor, produced_at: b.produced_at, by_membership_id: b.by_membership_id }
  end

  def packaging_rule(r)
    { id: r.id, branch_id: r.branch_id, order_type: r.order_type, stock_item_id: r.stock_item_id, item_name: r.stock_item.name, unit_code: r.stock_item.base_unit.code, quantity: r.quantity.to_s }
  end

  def audit(a)
    { id: a.id, order_id: a.order_id, order_label: a.order.label, business_day: a.order.business_day, status: a.status, entries: a.ledger_entry_ids.size, detail: a.detail, checked_at: a.checked_at }
  end
end

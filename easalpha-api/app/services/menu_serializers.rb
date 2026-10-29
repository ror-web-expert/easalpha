module MenuSerializers
  module_function

  def tax_rate(t)
    { id: t.id, name: t.name, rate: t.rate.to_f, inclusive: t.inclusive, authority: t.authority, active: t.active, is_default: t.is_default, payment_account_id: t.payment_account_id }
  end

  def station(s)
    { id: s.id, branch_id: s.branch_id, name: s.name, printer_name: s.printer_name, display_device_id: s.display_device_id, sort_order: s.sort_order }
  end

  def menu(m, category_count: nil)
    { id: m.id, name: m.name, show_online: m.show_online, time_rules: m.time_rules, sort_order: m.sort_order, is_default: m.is_default,
      archived_at: m.archived_at, category_count: category_count, created_at: m.created_at }
  end

  def category(c, product_count: nil)
    { id: c.id, menu_id: c.menu_id, name: c.name, name_ur: c.name_ur, subtitle: c.subtitle, image_key: c.image_key, sort_order: c.sort_order,
      show_online: c.show_online, station_id: c.station_id, product_count: product_count, archived_at: c.archived_at }
  end

  # costs: Catalog::Analysis.costs_for, so the catalogue can show a margin badge (null = no recipe).
  def product(p, full: false, costs: nil)
    h = { id: p.id, category_id: p.category_id, name: p.name, name_ur: p.name_ur, description: p.description, sku: p.sku, image_key: p.image_key,
          base_price_minor: p.base_price_minor, tax_rate_id: p.tax_rate_id, is_favourite: p.is_favourite, show_online: p.show_online, active: p.active,
          sold_by_weight: p.sold_by_weight, weight_unit: p.weight_unit, allergens: p.allergens, dietary_tags: p.dietary_tags, station_id: p.station_id,
          discount_value: p.discount_value.to_s, discount_type: p.discount_type, pct_code: p.pct_code,
          sort_order: p.sort_order, archived_at: p.archived_at, updated_at: p.updated_at }
    if full
      h[:variants] = p.variants.map { |v| variant(v) }
      h[:prices] = p.product_prices.map { |pp| { id: pp.id, variant_id: pp.variant_id, branch_id: pp.branch_id, order_type: pp.order_type, price_minor: pp.price_minor } }
      h[:modifier_group_ids] = p.product_modifier_groups.map(&:modifier_group_id)
      h[:barcodes] = p.barcodes.map { |b| barcode(b) }
      h[:cost] = costs[p.id] if costs
    end
    h
  end

  def consumable(c)
    { id: c.id, product_id: c.product_id, variant_id: c.variant_id, variant_name: c.variant&.name, order_type: c.order_type, stock_item_id: c.stock_item_id,
      item_name: c.stock_item.name, quantity: c.quantity.to_s, unit_id: c.unit_id, unit_code: c.unit.code }
  end

  def quick_add_item(q)
    { id: q.id, product_id: q.product_id, variant_id: q.variant_id, position: q.position, name: q.product.name, variant_name: q.variant&.name,
      price_minor: q.variant&.price_minor.presence || q.product.base_price_minor, image_key: q.product.image_key, active: q.product.active && q.product.archived_at.nil? }
  end

  def barcode(b)
    { id: b.id, code: b.code, variant_id: b.variant_id, quantity: b.quantity.to_s }
  end

  def variant(v)
    { id: v.id, product_id: v.product_id, name: v.name, price_minor: v.price_minor, sku: v.sku, sort_order: v.sort_order }
  end

  def modifier_group(g)
    { id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, required: g.required, sort_order: g.sort_order,
      modifiers: g.modifiers.map { |m| { id: m.id, name: m.name, name_ur: m.name_ur, price_minor: m.price_minor, sort_order: m.sort_order, active: m.active, stock_item_id: m.stock_item_id, quantity: m.quantity&.to_s, stock_unit_id: m.stock_unit_id } } }
  end

  def deal(d)
    { id: d.id, name: d.name, description: d.description, image_key: d.image_key, price_minor: d.price_minor, active: d.active, show_online: d.show_online, is_favourite: d.is_favourite,
      valid_from: d.valid_from, valid_to: d.valid_to, tax_rate_id: d.tax_rate_id, sort_order: d.sort_order,
      items: d.deal_items.map { |i| { id: i.id, product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity, choice_group: i.choice_group } } }
  end

  def promotion(p)
    { id: p.id, name: p.name, kind: p.kind, value: p.value.to_f, coupon_code: p.coupon_code, applies_to: p.applies_to, target_ids: p.target_ids, days: p.days,
      start_time: p.start_time&.strftime("%H:%M"), end_time: p.end_time&.strftime("%H:%M"), valid_from: p.valid_from, valid_to: p.valid_to,
      unit_limit: p.unit_limit, units_sold: p.units_sold, sold_out: p.sold_out?, active: p.active, min_order_minor: p.min_order_minor }
  end
end

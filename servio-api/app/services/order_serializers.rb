module OrderSerializers
  module_function

  def summary(o)
    { id: o.id, serial: o.serial, label: o.label, till_serial: o.till_serial, business_day: o.business_day, order_type: o.order_type, source: o.source,
      status: o.status, payment_status: o.payment_status, table_id: o.table_id, table_code: o.dining_table&.code, guest_name: o.guest_name, covers: o.covers,
      customer_id: o.customer_id, rider_id: o.rider_id, shift_id: o.shift_id, is_staff_meal: o.is_staff_meal, scheduled_for: o.scheduled_for,
      subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, service_charge_minor: o.service_charge_minor, tax_minor: o.tax_minor,
      rounding_minor: o.rounding_minor, tip_minor: o.tip_minor, delivery_charge_minor: o.delivery_charge_minor, total_minor: o.total_minor,
      paid_minor: o.paid_minor, due_minor: o.due_minor, item_count: o.items.count { |i| !i.cancelled? },
      placed_at: o.placed_at, ready_at: o.ready_at, served_at: o.served_at, paid_at: o.paid_at, closed_at: o.closed_at, voided_at: o.voided_at,
      void_reason: o.void_reason, notes: o.notes, payment_method_summary: o.payment_method_summary, receipt_number: o.receipt_number, taken_by_membership_id: o.taken_by_membership_id, device_id: o.device_id,
      client_created_at: o.client_created_at, created_at: o.created_at, updated_at: o.updated_at }
  end

  def full(o)
    summary(o).merge(
      items: o.items.map { |i| item(i) },
      discounts: o.discounts.map { |d| { id: d.id, order_item_id: d.order_item_id, promotion_id: d.promotion_id, kind: d.kind, value: d.value.to_f, amount_minor: d.amount_minor, reason: d.reason, applied_by_membership_id: d.applied_by_membership_id, approved_by_membership_id: d.approved_by_membership_id } },
      events: o.status_events.map { |e| { from: e.from_status, to: e.to_status, membership_id: e.membership_id, device_id: e.device_id, reason: e.reason, at: e.occurred_at } },
      voids: o.voids.map { |v| { id: v.id, reason: v.reason, stock_action: v.stock_action, amount_minor: v.amount_minor, by_membership_id: v.by_membership_id, approved_by_membership_id: v.approved_by_membership_id, at: v.voided_at } },
      service_charge_percent: o.service_charge_percent.to_f, staff_meal_reason: o.staff_meal_reason
    )
  end

  def item(i)
    { id: i.id, product_id: i.product_id, variant_id: i.variant_id, deal_id: i.deal_id, name: i.name_snapshot, unit_price_minor: i.unit_price_minor,
      quantity: i.quantity.to_s("F"), unit: i.unit, modifiers_minor: i.modifiers_minor, line_subtotal_minor: i.line_subtotal_minor, line_discount_minor: i.line_discount_minor,
      line_tax_minor: i.line_tax_minor, line_total_minor: i.line_total_minor, tax_rate: i.tax_rate_snapshot.to_f, tax_inclusive: i.tax_inclusive_snapshot,
      notes: i.notes, station_id: i.station_id, course: i.course, status: i.status, sent_at: i.sent_at, bumped_at: i.bumped_at, cancelled_reason: i.cancelled_reason,
      open_item: i.open_item, price_overridden: i.price_overridden, deal_components: i.deal_components, sort_order: i.sort_order, recipe_cost_minor_snapshot: i.recipe_cost_minor_snapshot,
      modifiers: i.modifiers.map { |m| { id: m.id, modifier_id: m.modifier_id, name: m.name_snapshot, price_minor: m.price_minor_snapshot, quantity: m.quantity.to_s("F") } } }
  end

  def ticket(t)
    { id: t.id, order_id: t.order_id, station_id: t.station_id, kind: t.kind, serial: t.serial, order_type: t.order_type, table_code: t.table_code,
      lines: t.lines, printed_at: t.printed_at, acknowledged_at: t.acknowledged_at, created_at: t.created_at }
  end
end

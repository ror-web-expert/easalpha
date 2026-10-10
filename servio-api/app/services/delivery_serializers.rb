module DeliverySerializers
  module_function

  def expense_category(c, children: nil)
    { id: c.id, name: c.name, parent_id: c.parent_id, full_name: c.full_name, sort_order: c.sort_order, archived_at: c.archived_at, children: children&.map { |x| expense_category(x) } }
  end

  def expense(e)
    { id: e.id, number: e.number, label: e.label, branch_id: e.branch_id, category_id: e.category_id, category: e.category.full_name, amount_minor: e.amount_minor, method_code: e.payment_method&.code,
      payment_account_id: e.payment_account_id, shift_id: e.shift_id, receipt_key: e.receipt_key, paid_to: e.paid_to, note: e.note, spent_on: e.spent_on, business_day: e.business_day, source: e.source,
      by_membership_id: e.by_membership_id, voided_at: e.voided_at, void_reason: e.void_reason, created_at: e.created_at }
  end

  def overhead(o) = { id: o.id, branch_id: o.branch_id, name: o.name, kind: o.kind, amount_minor: o.amount_minor, basis: o.basis, active: o.active }

  def zone(z) = { id: z.id, branch_id: z.branch_id, name: z.name, areas: z.areas, polygon: z.polygon, charge_minor: z.charge_minor, min_order_minor: z.min_order_minor, eta_minutes: z.eta_minutes, active: z.active, archived_at: z.archived_at }

  def rider(r)
    { id: r.id, branch_id: r.branch_id, membership_id: r.membership_id, name: r.name, phone: r.phone, vehicle: r.vehicle, vehicle_no: r.vehicle_no, address: r.address, charge_per_delivery_minor: r.charge_per_delivery_minor,
      float_minor: r.float_minor, status: r.status, last_lat: r.last_lat&.to_f, last_lng: r.last_lng&.to_f, last_seen_at: r.last_seen_at, active: r.active, archived_at: r.archived_at }
  end

  def delivery(d, full: false)
    o = d.order
    h = { id: d.id, order_id: d.order_id, order_label: o.label, order_status: o.status, order_total_minor: o.total_minor, payment_status: o.payment_status, customer_id: o.customer_id, guest_name: o.guest_name,
          rider_id: d.rider_id, rider_name: d.rider&.name, zone_id: d.zone_id, zone_name: d.zone&.name, address_id: d.address_id, charge_minor: d.charge_minor, status: d.status, failed_reason: d.failed_reason,
          cash_collected_minor: d.cash_collected_minor, assigned_at: d.assigned_at, picked_up_at: d.picked_up_at, delivered_at: d.delivered_at, settled_at: d.settled_at, settlement_id: d.settlement_id, created_at: d.created_at }
    if full
      h[:address] = d.address_id && (a = CustomerAddress.find_by(id: d.address_id)) && CustomerSerializers.address(a)
      h[:customer] = o.customer && { id: o.customer.id, name: o.customer.name, phone: o.customer.phone }
      h[:items] = o.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F") } }
      h[:events] = d.events.map { |e| { status: e.status, lat: e.lat&.to_f, lng: e.lng&.to_f, note: e.note, by_membership_id: e.by_membership_id, occurred_at: e.occurred_at } }
    end
    h
  end

  def movement(m) = { id: m.id, rider_id: m.rider_id, kind: m.kind, amount_minor: m.amount_minor, reason: m.reason, expense_id: m.expense_id, settlement_id: m.settlement_id, business_day: m.business_day, occurred_at: m.occurred_at, by_membership_id: m.by_membership_id }

  def settlement(s)
    { id: s.id, number: s.number, label: s.label, rider_id: s.rider_id, rider_name: s.rider.name, shift_id: s.shift_id, deliveries_count: s.deliveries_count, cash_collected_minor: s.cash_collected_minor,
      float_held_minor: s.float_held_minor, spent_minor: s.spent_minor, expected_minor: s.expected_minor, handed_in_minor: s.handed_in_minor, difference_minor: s.difference_minor, note: s.note,
      settled_by_membership_id: s.settled_by_membership_id, settled_at: s.settled_at }
  end
end

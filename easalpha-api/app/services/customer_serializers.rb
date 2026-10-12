module CustomerSerializers
  module_function

  def customer(c, full: false)
    h = { id: c.id, khata_no: c.khata_no, name: c.name, phone: c.phone, email: c.email, company: c.company, group_id: c.group_id, source: c.source, status: c.status,
          is_walk_in: c.is_walk_in, credit_limit_minor: c.credit_limit_minor, balance_minor: c.balance_minor, loyalty_points: c.loyalty_points, birthday: c.birthday,
          whatsapp_opt_in: c.whatsapp_opt_in, orders_count: c.orders_count, net_spent_minor: c.net_spent_minor, last_order_at: c.last_order_at, notes: c.notes,
          room: c.room, member_no: c.member_no, guardian_name: c.guardian_name, guardian_phone: c.guardian_phone, notify_guardian: c.notify_guardian,
          archived_at: c.archived_at, created_at: c.created_at }
    h[:addresses] = c.addresses.order(:created_at).map { |a| address(a) } if full
    h[:group] = c.group && { id: c.group.id, name: c.group.name, discount_percent: c.group.discount_percent.to_f } if full
    h
  end

  def address(a)
    { id: a.id, customer_id: a.customer_id, label: a.label, line1: a.line1, line2: a.line2, area: a.area, city: a.city, lat: a.lat&.to_f, lng: a.lng&.to_f, is_default: a.is_default, text: a.to_s }
  end

  def group(g, count: nil)
    { id: g.id, name: g.name, discount_percent: g.discount_percent.to_f, customer_count: count, archived_at: g.archived_at }
  end

  def table(t, order: nil)
    { id: t.id, branch_id: t.branch_id, floor_id: t.floor_id, code: t.code, name: t.name, seats: t.seats, location: t.location, status: t.status, position: t.position,
      qr_token: t.qr_token, merged_into_table_id: t.merged_into_table_id, current_order_id: t.current_order_id, waiter_membership_id: t.waiter_membership_id,
      current_order: order && OrderSerializers.summary(order), archived_at: t.archived_at }
  end

  def floor(f, tables: nil)
    { id: f.id, branch_id: f.branch_id, name: f.name, sort_order: f.sort_order, layout: f.layout, tables: tables&.map { |t| table(t) } }
  end
end

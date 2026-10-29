module CanteenSerializers
  module_function

  def session(s)
    { id: s.id, branch_id: s.branch_id, name: s.name, starts_at: s.starts_at.strftime("%H:%M"), ends_at: s.ends_at.strftime("%H:%M"), max_claims: s.max_claims, active: s.active, sort_order: s.sort_order }
  end

  def plan(p)
    { id: p.id, branch_id: p.branch_id, meal_session_id: p.meal_session_id, session: p.meal_session && session(p.meal_session), plan_date: p.plan_date, status: p.status, notes: p.notes,
      published_at: p.published_at, items: p.items.map { |i| plan_item(i) }, claims: p.items.sum(&:claims_count), planned: p.items.sum { |i| i.planned_qty.to_i } }
  end

  def plan_item(i)
    pr = i.product
    { id: i.id, product_id: i.product_id, name: pr.name, name_ur: pr.name_ur, image_key: pr.image_key, price_minor: pr.base_price_minor, worker_price_minor: i.worker_price_minor,
      planned_qty: i.planned_qty, claims_count: i.claims_count, sold_out: i.sold_out?, sort_order: i.sort_order }
  end

  def claim(c)
    { id: c.id, employee_id: c.employee_id, employee_name: c.employee&.name, customer_id: c.customer_id, order_id: c.order_id, meal_session_id: c.meal_session_id, session: c.meal_session&.name,
      meal_plan_item_id: c.meal_plan_item_id, dish: c.meal_plan_item&.product&.name, plan_date: c.plan_date, token_no: c.token_no, token_label: c.token_label, status: c.status,
      scanned_at: c.scanned_at, served_at: c.served_at, cancelled_at: c.cancelled_at, cancel_reason: c.cancel_reason, source: c.source, device_id: c.device_id,
      worker_price_minor: c.worker_price_minor, company_share_minor: c.company_share_minor }
  end

  def worker(e)
    { id: e.id, name: e.name, phone: e.phone, cnic: e.cnic, department: e.department&.name, designation: e.designation, customer_id: e.customer_id,
      fingerprint_enrolled: e.fingerprint_enrolled, fingerprint_id: e.fingerprint_id, branch_id: e.branch_id }
  end
end

module CanteenSerializers
  module_function

  def session(s)
    { id: s.id, branch_id: s.branch_id, name: s.name, starts_at: s.starts_at.strftime("%H:%M"), ends_at: s.ends_at.strftime("%H:%M"), max_claims: s.max_claims, active: s.active, sort_order: s.sort_order }
  end

  def plan(p)
    { id: p.id, branch_id: p.branch_id, meal_session_id: p.meal_session_id, session: p.meal_session && session(p.meal_session), plan_date: p.plan_date, status: p.status, notes: p.notes,
      published_at: p.published_at, items: p.items.map { |i| plan_item(i, p.branch) }, claims: p.items.sum(&:claims_count), planned: p.items.sum { |i| i.planned_qty.to_i } }
  end

  # price_minor is the menu price before tax; full_price_minor what a kiosk order of one charges (tax, service charge,
  # rounding), and worker_pays_minor what the worker is charged: the plan's worker price, never above the full price.
  def plan_item(i, branch = nil)
    pr = i.product
    full = branch && Canteen::Plans.dish_price_minor(pr, branch)
    { id: i.id, product_id: i.product_id, name: pr.name, name_ur: pr.name_ur, image_key: pr.image_key, price_minor: pr.base_price_minor, worker_price_minor: i.worker_price_minor,
      full_price_minor: full, worker_pays_minor: full && (i.worker_price_minor ? [ i.worker_price_minor, full ].min : full),
      planned_qty: i.planned_qty, claims_count: i.claims_count, sold_out: i.sold_out?, sort_order: i.sort_order }
  end

  def claim(c)
    { id: c.id, employee_id: c.employee_id, employee_name: c.employee&.name, customer_id: c.customer_id, order_id: c.order_id, meal_session_id: c.meal_session_id, session: c.meal_session&.name,
      meal_plan_item_id: c.meal_plan_item_id, dish: c.meal_plan_item&.product&.name, plan_date: c.plan_date, token_no: c.token_no, token_label: c.token_label, status: c.status,
      scanned_at: c.scanned_at, served_at: c.served_at, cancelled_at: c.cancelled_at, cancel_reason: c.cancel_reason, source: c.source, device_id: c.device_id,
      worker_price_minor: c.worker_price_minor, company_share_minor: c.company_share_minor }
  end

  # For the people who manage the canteen (canteen.manage): the reader's id, phone and CNIC.
  def worker(e)
    kiosk_worker(e).merge(fingerprint_id: e.fingerprint_id, phone: e.phone, cnic: e.cnic)
  end

  # What a kiosk or counter screen holds for every worker, whatever canteen.manual_lookup says, so it can name a finger
  # with no connection (6 Nov 2026 review): never a phone or CNIC, and the reader's id only as a hash the kiosk matches
  # by hashing what the reader types (fingerprint_hash), so the list does not hand out the ids to type in.
  def kiosk_worker(e)
    { id: e.id, name: e.name, department: e.department&.name, designation: e.designation, customer_id: e.customer_id,
      fingerprint_enrolled: e.fingerprint_enrolled, fingerprint_hash: fingerprint_hash(e.fingerprint_id, e.business_id), branch_id: e.branch_id }
  end

  # SHA-256 of "<salt>:<reader id, trimmed and lower-cased>" in hex, the salt being the business id (fingerprint_salt
  # in the kiosk payload), so a hash from one business says nothing in another. src/components/canteen/fingerprint.ts
  # computes the same.
  def fingerprint_hash(fingerprint_id, salt)
    id = fingerprint_id.to_s.strip.downcase
    id.empty? ? nil : Digest::SHA256.hexdigest("#{salt}:#{id}")
  end
end

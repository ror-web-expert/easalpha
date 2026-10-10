module SupplierSerializers
  module_function

  # SPEC: balance with a direction label (To Pay, To Receive, Settled), a count of distinct items supplied and of purchases.
  def supplier(s, counts: nil)
    h = { id: s.id, name: s.name, contact_name: s.contact_name, phone: s.phone, email: s.email, address: s.address, ntn: s.ntn, opening_balance_minor: s.opening_balance_minor, balance_minor: s.balance_minor,
          balance_label: balance_label(s.balance_minor), payment_terms_days: s.payment_terms_days, notes: s.notes, active: s.active, archived_at: s.archived_at, created_at: s.created_at }
    c = counts ? counts[s.id] : supplier_counts([s.id])[s.id]
    h.merge(items_count: c&.dig(:items_count) || 0, purchases_count: c&.dig(:purchases_count) || 0)
  end

  def balance_label(balance_minor) = balance_minor.positive? ? "to_pay" : (balance_minor.negative? ? "to_receive" : "settled")

  def supplier_counts(ids)
    receipts = GoodsReceipt.where(supplier_id: ids, status: "posted")
    purchases = receipts.group(:supplier_id).count
    items = GoodsReceiptLine.joins(:goods_receipt).where(goods_receipts: { supplier_id: ids, status: "posted" }).group("goods_receipts.supplier_id").distinct.count(:stock_item_id)
    ids.index_with { |id| { items_count: items[id] || 0, purchases_count: purchases[id] || 0 } }
  end

  def adjustment(a)
    { id: a.id, supplier_id: a.supplier_id, amount_minor: a.amount_minor, reason: a.reason, business_day: a.business_day, by_membership_id: a.by_membership_id, created_at: a.created_at }
  end

  def purchase_order(po, full: false)
    h = { id: po.id, number: po.number, label: po.label, status: po.status, branch_id: po.branch_id, supplier_id: po.supplier_id, supplier_name: po.supplier.name, expected_on: po.expected_on,
          total_minor: po.total_minor, paid_minor: po.paid_minor, payment_status: po.payment_status, note: po.note, sent_at: po.sent_at, received_at: po.received_at, cancelled_at: po.cancelled_at,
          created_at: po.created_at, line_count: po.lines.size }
    h[:lines] = po.lines.map { |l| po_line(l) } if full
    h[:receipts] = po.goods_receipts.map { |g| goods_receipt(g) } if full
    h
  end

  def po_line(l)
    { id: l.id, stock_item_id: l.stock_item_id, item_name: l.stock_item.name, unit_id: l.unit_id, unit_code: l.unit.code, quantity: l.quantity.to_s, base_quantity: l.base_quantity.to_s,
      unit_cost_minor: l.unit_cost_minor, line_total_minor: (BigDecimal(l.unit_cost_minor.to_s) * l.quantity).round, received_base_qty: l.received_base_qty.to_s, outstanding_base_qty: l.outstanding_base_qty.to_s,
      base_unit_code: l.stock_item.base_unit.code }
  end

  def goods_receipt(g, full: false)
    h = { id: g.id, number: g.number, label: g.label, status: g.status, branch_id: g.branch_id, supplier_id: g.supplier_id, supplier_name: g.supplier.name, purchase_order_id: g.purchase_order_id,
          stock_document_id: g.stock_document_id, stock_section_id: g.stock_section_id, invoice_ref: g.invoice_ref, received_on: g.received_on, business_day: g.business_day, total_minor: g.total_minor,
          note: g.note, cancelled_at: g.cancelled_at, created_at: g.created_at, line_count: g.lines.size }
    h[:lines] = g.lines.map { |l| receipt_line(l) } if full
    h
  end

  def receipt_line(l)
    { id: l.id, stock_item_id: l.stock_item_id, item_name: l.stock_item.name, unit_id: l.unit_id, unit_code: l.unit.code, quantity: l.quantity.to_s, base_quantity: l.base_quantity.to_s,
      unit_cost_minor: l.unit_cost_minor, line_total_minor: l.line_total_minor, batch_no: l.batch_no, expires_on: l.expires_on, purchase_order_line_id: l.purchase_order_line_id }
  end

  def purchase_return(r, full: false)
    h = { id: r.id, number: r.number, label: r.label, status: r.status, supplier_id: r.supplier_id, supplier_name: r.supplier.name, goods_receipt_id: r.goods_receipt_id, stock_document_id: r.stock_document_id,
          reason: r.reason, settlement: r.settlement, amount_minor: r.amount_minor, payment_method_id: r.payment_method_id, returned_on: r.returned_on, business_day: r.business_day, created_at: r.created_at }
    h[:lines] = r.lines.map { |l| { id: l.id, stock_item_id: l.stock_item_id, item_name: l.stock_item.name, unit_code: l.unit.code, quantity: l.quantity.to_s, unit_cost_minor: l.unit_cost_minor, line_total_minor: l.line_total_minor } } if full
    h
  end

  def payment(p)
    { id: p.id, number: p.number, label: p.label, supplier_id: p.supplier_id, direction: p.direction, amount_minor: p.amount_minor, method_code: p.payment_method&.code, payment_account_id: p.payment_account_id,
      reference: p.reference, note: p.note, goods_receipt_id: p.goods_receipt_id, purchase_order_id: p.purchase_order_id, purchase_order_label: p.purchase_order&.label, paid_on: p.paid_on, business_day: p.business_day, by_membership_id: p.by_membership_id, created_at: p.created_at }
  end

  def price(h)
    { id: h.id, supplier_id: h.supplier_id, supplier_name: h.supplier.name, stock_item_id: h.stock_item_id, unit_code: h.unit&.code, unit_cost_minor: h.unit_cost_minor, base_unit_cost_minor: h.base_unit_cost_minor.to_s,
      observed_on: h.observed_on, goods_receipt_id: h.goods_receipt_id }
  end
end

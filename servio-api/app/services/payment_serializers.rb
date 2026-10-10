module PaymentSerializers
  module_function

  def payment(p)
    { id: p.id, order_id: p.order_id, method_code: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor, change_minor: p.change_minor, tip_minor: p.tip_minor,
      reference: p.reference, card_terminal_ref: p.card_terminal_ref, status: p.status, received_by_membership_id: p.received_by_membership_id, shift_id: p.shift_id,
      business_day: p.business_day, received_at: p.received_at }
  end

  def refund(r)
    { id: r.id, order_id: r.order_id, method_code: r.payment_method.code, amount_minor: r.amount_minor, reason: r.reason, by_membership_id: r.by_membership_id,
      approved_by_membership_id: r.approved_by_membership_id, business_day: r.business_day, refunded_at: r.refunded_at }
  end

  def payment_method(m)
    { id: m.id, code: m.code, name: m.name, kind: m.kind, payment_account_id: m.payment_account_id, catalogue_code: m.catalogue_code, active: m.active, works_offline: m.works_offline, needs_reference: m.needs_reference, sort_order: m.sort_order }
  end

  def account(a)
    { id: a.id, branch_id: a.branch_id, name: a.name, kind: a.kind, is_default: a.is_default, cashier_membership_id: a.cashier_membership_id, shift_id: a.shift_id,
      opening_balance_minor: a.opening_balance_minor, current_balance_minor: a.current_balance_minor, active: a.active, bank_name: a.bank_name, account_no: a.account_no }
  end

  def entry(e)
    { id: e.id, payment_account_id: e.payment_account_id, kind: e.kind, amount_minor: e.amount_minor, business_day: e.business_day, ref_table: e.ref_table, ref_id: e.ref_id,
      description: e.description, by_membership_id: e.by_membership_id, shift_id: e.shift_id, reversed_by_entry_id: e.reversed_by_entry_id, occurred_at: e.occurred_at }
  end

  def customer_payment(p)
    { id: p.id, number: p.number, customer_id: p.customer_id, direction: p.direction, amount_minor: p.amount_minor, method_code: p.payment_method&.code, reference: p.reference,
      collected_by_membership_id: p.collected_by_membership_id, business_day: p.business_day, received_at: p.received_at }
  end
end

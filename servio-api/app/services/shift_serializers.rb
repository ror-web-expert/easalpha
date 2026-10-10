module ShiftSerializers
  module_function

  def shift(s, with_expected: false)
    h = { id: s.id, branch_id: s.branch_id, device_id: s.device_id, cashier_membership_id: s.cashier_membership_id, drawer_account_id: s.drawer_account_id,
          business_day: s.business_day, status: s.status, settlement_status: s.settlement_status, opened_at: s.opened_at, closed_at: s.closed_at,
          opening_cash_minor: s.opening_cash_minor, counted_cash_minor: s.counted_cash_minor, approved_by_membership_id: s.approved_by_membership_id, close_note: s.close_note,
          movements: s.cash_movements.order(:occurred_at).map { |m| movement(m) } }
    if with_expected || !s.open?
      h[:expected_cash_minor] = s.open? ? s.expected_cash : s.expected_cash_minor
      h[:over_short_minor] = s.over_short_minor
    end
    h
  end

  def movement(m)
    { id: m.id, shift_id: m.shift_id, kind: m.kind, amount_minor: m.amount_minor, reason: m.reason, reference: m.reference, by_membership_id: m.by_membership_id, approved_by_membership_id: m.approved_by_membership_id, occurred_at: m.occurred_at }
  end
end

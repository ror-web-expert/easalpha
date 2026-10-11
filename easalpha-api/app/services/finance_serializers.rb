module FinanceSerializers
  module_function

  def gl_account(a, balance: nil)
    h = { id: a.id, code: a.code, name: a.name, kind: a.kind, normal_side: a.normal_side, parent_id: a.parent_id, is_header: a.is_header, is_system: a.is_system,
          opening_balance_minor: a.opening_balance_minor, payment_account_id: a.payment_account_id, description: a.description, archived_at: a.archived_at }
    h[:balance_minor] = balance unless balance.nil?
    h
  end

  def journal_entry(e, full: false)
    h = { id: e.id, number: e.number, label: e.label, kind: e.kind, business_day: e.business_day, description: e.description, ref_table: e.ref_table, ref_id: e.ref_id,
          reversed_by_id: e.reversed_by_id, reverses_id: e.reverses_id, by_membership_id: e.by_membership_id, posted_at: e.posted_at, debit_minor: e.lines.sum(&:debit_minor) }
    h[:lines] = e.lines.map { |l| { id: l.id, gl_account_id: l.gl_account_id, code: l.gl_account.code, account: l.gl_account.name, debit_minor: l.debit_minor, credit_minor: l.credit_minor, description: l.description } } if full
    h
  end

  def fixed_asset(a)
    { id: a.id, name: a.name, gl_account_id: a.gl_account_id, account: a.gl_account.name, cost_minor: a.cost_minor, salvage_minor: a.salvage_minor, purchased_on: a.purchased_on,
      useful_life_months: a.useful_life_months, method: a.method, monthly_minor: a.monthly_minor, accumulated_minor: a.accumulated_minor, book_value_minor: a.book_value_minor,
      depreciated_through: a.depreciated_through, status: a.status, disposed_at: a.disposed_at, note: a.note }
  end
end

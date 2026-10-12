module PayrollSerializers
  module_function

  def employee(e)
    { id: e.id, branch_id: e.branch_id, membership_id: e.membership_id, department_id: e.department_id, department: e.department&.name, name: e.name, phone: e.phone, cnic: e.cnic, designation: e.designation,
      base_salary_minor: e.base_salary_minor, pay_frequency: e.pay_frequency, joined_on: e.joined_on, left_on: e.left_on, fingerprint_enrolled: e.fingerprint_enrolled, fingerprint_id: e.fingerprint_id, fingerprint_enrolled_at: e.fingerprint_enrolled_at, fingerprint_revoked_at: e.fingerprint_revoked_at, shares_tips: e.shares_tips, notes: e.notes, whatsapp_notify: e.whatsapp_notify, archived_at: e.archived_at,
      components: e.employee_salary_components.map { |c| { id: c.id, salary_component_id: c.salary_component_id, name: c.salary_component.name, kind: c.salary_component.kind, amount_minor: c.amount_minor, percent: c.percent&.to_f } } }
  end

  def attendance(a)
    { id: a.id, employee_id: a.employee_id, employee_name: a.employee.name, business_day: a.business_day, checked_in_at: a.checked_in_at, checked_out_at: a.checked_out_at, source: a.source, late_minutes: a.late_minutes,
      worked_minutes: a.worked_minutes, overtime_minutes: a.overtime_minutes, missing_punch: a.missing_punch, auto_closed: a.auto_closed, fine_minor: a.fine_minor, status: a.status, note: a.note, marked_by_membership_id: a.marked_by_membership_id }
  end

  def scan(s)
    { id: s.id, employee_id: s.employee_id, employee_name: s.employee&.name, attendance_id: s.attendance_id, device_id: s.device_id, fingerprint_id: s.fingerprint_id, scanned_at: s.scanned_at, result: s.result, note: s.note }
  end

  def leave(l) = { id: l.id, employee_id: l.employee_id, employee_name: l.employee.name, kind: l.kind, from_date: l.from_date, to_date: l.to_date, days: (l.to_date - l.from_date).to_i + 1, reason: l.reason, status: l.status, approved_by_membership_id: l.approved_by_membership_id, decided_at: l.decided_at }
  def holiday(h) = { id: h.id, branch_id: h.branch_id, name: h.name, on_date: h.on_date, paid: h.paid }
  def rule(r)
    { id: r.id, employee_id: r.employee_id, shift_start: r.shift_start&.strftime("%H:%M"), shift_end: r.shift_end&.strftime("%H:%M"), grace_minutes: r.grace_minutes, late_fine_minor: r.late_fine_minor,
      late_fine_after_minutes: r.late_fine_after_minutes, absent_rule: r.absent_rule, fixed_divisor: r.fixed_divisor, working_days: r.working_days, require_fingerprint_to_close_shift: r.require_fingerprint_to_close_shift,
      rules_enabled: r.rules_enabled, late_after_minutes: r.late_after_minutes, half_day_after_minutes: r.half_day_after_minutes, absent_after_minutes: r.absent_after_minutes,
      overtime_enabled: r.overtime_enabled, overtime_rate_minor_per_hour: r.overtime_rate_minor_per_hour, no_scan_counts_absent: r.no_scan_counts_absent,
      free_lates: r.free_lates, free_half_days: r.free_half_days, free_absents: r.free_absents, late_penalty: r.late_penalty, half_day_penalty: r.half_day_penalty, absent_penalty: r.absent_penalty,
      half_day_fine_minor: r.half_day_fine_minor, absent_fine_minor: r.absent_fine_minor, fine_cap_minor: r.fine_cap_minor, checkout_gap_minutes: r.checkout_gap_minutes }
  end
  def advance(a) = { id: a.id, number: a.number, label: a.label, employee_id: a.employee_id, employee_name: a.employee.name, amount_minor: a.amount_minor, outstanding_minor: a.outstanding_minor, installment_minor: a.installment_minor, reason: a.reason, status: a.status, requested_on: a.requested_on, approved_by_membership_id: a.approved_by_membership_id, paid_at: a.paid_at, expense_id: a.expense_id }
  def run(r) = { id: r.id, label: r.label, settings_snapshot: r.settings_snapshot, branch_id: r.branch_id, month: r.month, status: r.status, notes: r.notes, employees_count: r.employees_count, gross_minor: r.gross_minor, deductions_minor: r.deductions_minor, net_minor: r.net_minor, generated_by_membership_id: r.generated_by_membership_id, paid_at: r.paid_at, created_at: r.created_at }
  def payslip(p)
    { id: p.id, payroll_run_id: p.payroll_run_id, employee_id: p.employee_id, employee_name: p.employee.name, designation: p.employee.designation, base_minor: p.base_minor, earnings_minor: p.earnings_minor, deductions_minor: p.deductions_minor, absence_minor: p.absence_minor,
      late_fines_minor: p.late_fines_minor, advances_recovered_minor: p.advances_recovered_minor, tips_minor: p.tips_minor, commission_minor: p.commission_minor, net_minor: p.net_minor, days_present: p.days_present, days_absent: p.days_absent, days_leave: p.days_leave,
      detail: p.detail, paid_at: p.paid_at, expense_id: p.expense_id }
  end
end

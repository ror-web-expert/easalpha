module Payroll
  # SPEC attendance rules engine. A master switch decides whether rules apply at all; with it off every scan is Present.
  # Thresholds (late, half day, absent after N minutes from shift start) are judged on the first scan and the status is
  # decided at check-in only. Overtime counts only on a real clock-out; a missing punch is flagged, never guessed.
  # Weekly offs, holidays and approved leave are never absent. Allowances, penalties and the fine cap are priced by
  # charges(), which the payroll run snapshots. Rule changes never rewrite saved rows.
  module Attendance
    module_function

    def branch_for(employee, branch = nil) = branch || employee.branch || Branch.first

    # Shift start for the day: the employee's rule, else the business hours from Store settings (SPEC fallback).
    def shift_start_for(rule, branch, local)
      if rule.persisted? && rule.shift_start
        local.change(hour: rule.shift_start.hour, min: rule.shift_start.min)
      else
        local.change(hour: branch.business_day_start.hour, min: branch.business_day_start.min)
      end
    end

    # Status from the minutes after shift start on the first scan.
    def status_for(rule, minutes_late)
      return "present" unless rule.rules_enabled
      return "absent" if rule.absent_after_minutes && minutes_late >= rule.absent_after_minutes
      return "half_day" if rule.half_day_after_minutes && minutes_late >= rule.half_day_after_minutes
      threshold = rule.late_after_minutes || rule.grace_minutes
      return "late" if threshold && minutes_late > threshold
      "present"
    end

    def check_in!(employee, at: Time.current, source: "manual", by: nil, branch: nil, selfie_key: nil, device: nil)
      rule = employee.rule
      b = branch_for(employee, branch)
      local = at.in_time_zone(b.time_zone)
      day = b.business_day_for(at)
      start = shift_start_for(rule, b, local)
      minutes_late = [((local - start) / 60).floor, 0].max
      status = status_for(rule, minutes_late)
      late = status == "present" ? 0 : minutes_late
      # The row records the day's own fine for the screens; payroll re-prices the month so allowances and the cap apply once.
      fine = rule.rules_enabled && rule.penalty_for(status).in?(%w[fine_only both]) ? rule.fine_for(status) : 0
      a = ::Attendance.find_or_initialize_by(employee_id: employee.id, business_day: day)
      raise Api::Errors::Conflict.new("attendance.checked_in", "#{employee.name} already checked in today") if a.persisted? && a.checked_in_at
      a.assign_attributes(branch_id: b.id, checked_in_at: at, source: source, late_minutes: late, fine_minor: fine, status: status, marked_by_membership_id: by&.id, selfie_key: selfie_key,
                          lost_day: false, missing_punch: false, auto_closed: false)
      a.save!
      log!(employee, a, "check_in", at: at, device: device, note: status)
      a
    end

    def check_out!(employee, at: Time.current, by: nil, device: nil, manual: false)
      a = ::Attendance.where(employee_id: employee.id).where.not(checked_in_at: nil).where(checked_out_at: nil).order(business_day: :desc).first
      raise Api::Errors::Conflict.new("attendance.not_in", "#{employee.name} is not checked in") unless a
      rule = employee.rule
      b = branch_for(employee, a.branch)
      overtime = 0
      if rule.overtime_enabled
        shift_end = a.checked_in_at.in_time_zone(b.time_zone).change(hour: rule.shift_end.hour, min: rule.shift_end.min)
        shift_end += 1.day if shift_end < a.checked_in_at
        overtime = [((at - shift_end) / 60).floor, 0].max
      end
      a.update!(checked_out_at: at, worked_minutes: ((at - a.checked_in_at) / 60).floor, overtime_minutes: overtime, missing_punch: false, auto_closed: false, marked_by_membership_id: by&.id || a.marked_by_membership_id)
      log!(employee, a, manual ? "manual_out" : "check_out", at: at, device: device)
      a
    end

    # SPEC kiosk intake: one tap checks in or out. A second tap inside the checkout gap shows "Already Marked".
    def scan!(fingerprint_id: nil, employee: nil, at: Time.current, branch: nil, device: nil, source: "fingerprint")
      employee ||= Employee.active.find_by(fingerprint_id: fingerprint_id.to_s, fingerprint_revoked_at: nil)
      unless employee
        AttendanceScan.create!(branch_id: branch&.id, device_id: device&.id, fingerprint_id: fingerprint_id, scanned_at: at, result: "unknown", note: "no enrolled employee")
        raise Api::Errors::NotFound.new("attendance.unknown_fingerprint", "No enrolled employee matches that fingerprint")
      end
      open = ::Attendance.where(employee_id: employee.id).where.not(checked_in_at: nil).where(checked_out_at: nil).order(business_day: :desc).first
      b = branch_for(employee, branch)
      if open && open.business_day < b.business_day_for(at)
        # Yesterday's record never got its check-out: close it at the end of that business day as a missing punch.
        end_at = b.business_day_end_at(open.business_day)
        open.update!(checked_out_at: end_at, worked_minutes: [((end_at - open.checked_in_at) / 60).floor, 0].max, overtime_minutes: 0, missing_punch: true, auto_closed: true)
        log!(employee, open, "auto_close", at: end_at, device: device, note: "no check-out; closed at the end of the business day")
        open = nil
      end
      if open
        gap = employee.rule.checkout_gap_minutes
        if at < open.checked_in_at + gap.minutes
          log!(employee, open, "already_marked", at: at, device: device, note: "inside the #{gap} minute checkout gap")
          return { result: "already_marked", attendance: open, employee: employee }
        end
        { result: "check_out", attendance: check_out!(employee, at: at, device: device), employee: employee }
      else
        day = b.business_day_for(at)
        if (done = ::Attendance.find_by(employee_id: employee.id, business_day: day)) && done.checked_out_at
          log!(employee, done, "already_marked", at: at, device: device, note: "already checked out today")
          return { result: "already_marked", attendance: done, employee: employee }
        end
        { result: "check_in", attendance: check_in!(employee, at: at, source: source, branch: b, device: device), employee: employee }
      end
    end

    def log!(employee, attendance, result, at:, device: nil, note: nil)
      AttendanceScan.create!(branch_id: attendance&.branch_id || employee.branch_id, employee_id: employee.id, attendance_id: attendance&.id, device_id: device&.id, fingerprint_id: employee.fingerprint_id,
                             scanned_at: at, result: result, note: note)
    end

    def mark!(employee, day:, status:, by:, note: nil)
      a = ::Attendance.find_or_initialize_by(employee_id: employee.id, business_day: day)
      a.assign_attributes(status: status, note: note, marked_by_membership_id: by&.id, source: "manual", branch_id: employee.branch_id)
      a.save!
      a
    end

    # SPEC: anyone who never checks out is auto-closed at the end of the business day, flagged as a missing punch,
    # earning no overtime.
    def auto_close!(branch:, day:)
      end_at = branch.business_day_end_at(day)
      count = 0
      ::Attendance.where(branch_id: branch.id, business_day: ..day).where.not(checked_in_at: nil).where(checked_out_at: nil).includes(:employee).find_each do |a|
        a.update!(checked_out_at: end_at, worked_minutes: [((end_at - a.checked_in_at) / 60).floor, 0].max, overtime_minutes: 0, missing_punch: true, auto_closed: true)
        log!(a.employee, a, "auto_close", at: end_at, note: "no check-out; closed at the end of the business day")
        count += 1
      end
      count
    end

    # Fills the days without a record: weekly offs, holidays and approved leave by name, the rest absent when the
    # rule says a no-scan day counts as absent.
    def fill_absences!(from:, to:)
      count = 0
      Employee.active.find_each do |e|
        rule = e.rule
        leaves = LeaveRequest.where(employee_id: e.id, status: "approved")
        hols = Holiday.where("branch_id IS NULL OR branch_id = ?", e.branch_id).pluck(:on_date).to_set
        (from..to).each do |d|
          next unless e.active_on?(d)
          next if ::Attendance.exists?(employee_id: e.id, business_day: d)
          status = if hols.include?(d) then "holiday"
                   elsif leaves.any? { |l| l.covers?(d) } then "leave"
                   elsif rule.weekly_off?(d) then "weekly_off"
                   elsif rule.rules_enabled && !rule.no_scan_counts_absent then next
                   else "absent"
                   end
          ::Attendance.create!(employee: e, branch_id: e.branch_id, business_day: d, status: status, source: "manual")
          count += 1
        end
      end
      count
    end

    def month_summary(employee, month)
      from, to = month.beginning_of_month, month.end_of_month
      rows = ::Attendance.where(employee_id: employee.id, business_day: from..to)
      unpaid_leave_days = LeaveRequest.where(employee_id: employee.id, status: "approved", kind: "unpaid").sum { |l| ([l.from_date, from].max..[l.to_date, to].min).count }
      c = charges(employee, month, rows: rows)
      { present: rows.where(status: %w[present late half_day]).count, late: rows.where(status: "late").count, half_days: rows.where(status: "half_day").count, absent: rows.where(status: "absent").count,
        leave: rows.where(status: "leave").count, unpaid_leave: unpaid_leave_days, holiday: rows.where(status: "holiday").count, weekly_off: rows.where(status: "weekly_off").count,
        late_minutes: rows.sum(:late_minutes), late_days: rows.where("late_minutes > 0").count, overtime_minutes: rows.sum(:overtime_minutes), missing_punches: rows.where(missing_punch: true).count,
        fines_minor: c[:fines_minor], lost_days: c[:lost_days], worked_minutes: rows.sum(:worked_minutes), charges: c }
    end

    # SPEC allowances, penalties and the fine cap. Free allowances forgive the first N of each status; a penalty is
    # Fine only, Lose the day's pay, Both or Not charged; the cap limits fines only, never lost days.
    def charges(employee, month, rows: nil)
      rule = employee.rule
      from, to = month.beginning_of_month, month.end_of_month
      rows ||= ::Attendance.where(employee_id: employee.id, business_day: from..to)
      fines = 0
      lost = 0.to_d
      detail = {}
      ::Attendance::CHARGEABLE.each do |status|
        n = rows.where(status: status).count
        charged = [n - rule.free_for(status), 0].max
        penalty = rule.rules_enabled ? rule.penalty_for(status) : "none"
        penalty = "lose_day" if status == "absent" && !rule.rules_enabled # an absence is always a lost day
        fine = penalty.in?(%w[fine_only both]) ? rule.fine_for(status) * charged : 0
        day_value = status == "half_day" ? 0.5 : 1
        lost_here = penalty.in?(%w[lose_day both]) ? charged * day_value : 0
        fines += fine
        lost += lost_here
        detail[status] = { count: n, free: rule.free_for(status), charged: charged, penalty: penalty, fine_minor: fine, lost_days: lost_here.to_f }
      end
      capped = rule.fine_cap_minor && fines > rule.fine_cap_minor ? rule.fine_cap_minor : fines
      { fines_minor: capped, fines_before_cap_minor: fines, fine_cap_minor: rule.fine_cap_minor, lost_days: lost.to_f, detail: detail, rules_enabled: rule.rules_enabled }
    end
  end
end

module Payroll
  # Check in and out against the employee's rule, lateness and fines, absences, and the month summary.
  module Attendance
    module_function

    def check_in!(employee, at: Time.current, source: "manual", by: nil, branch: nil, selfie_key: nil)
      rule = employee.rule
      zone = (branch || employee.branch || Branch.first).time_zone
      local = at.in_time_zone(zone)
      day = (branch || employee.branch || Branch.first).business_day_for(at)
      start = local.change(hour: rule.shift_start.hour, min: rule.shift_start.min)
      late = [((local - start) / 60).floor - rule.grace_minutes, 0].max
      fine = late > rule.late_fine_after_minutes ? rule.late_fine_minor : 0
      a = ::Attendance.find_or_initialize_by(employee_id: employee.id, business_day: day)
      raise Api::Errors::Conflict.new("attendance.checked_in", "#{employee.name} already checked in today") if a.persisted? && a.checked_in_at
      a.assign_attributes(branch_id: (branch || employee.branch)&.id, checked_in_at: at, source: source, late_minutes: late, fine_minor: fine, status: "present", marked_by_membership_id: by&.id, selfie_key: selfie_key)
      a.save!
      a
    end

    def check_out!(employee, at: Time.current, by: nil)
      a = ::Attendance.where(employee_id: employee.id).where.not(checked_in_at: nil).where(checked_out_at: nil).order(business_day: :desc).first
      raise Api::Errors::Conflict.new("attendance.not_in", "#{employee.name} is not checked in") unless a
      a.update!(checked_out_at: at, worked_minutes: ((at - a.checked_in_at) / 60).floor, marked_by_membership_id: by&.id || a.marked_by_membership_id)
      a
    end

    def mark!(employee, day:, status:, by:, note: nil)
      a = ::Attendance.find_or_initialize_by(employee_id: employee.id, business_day: day)
      a.assign_attributes(status: status, note: note, marked_by_membership_id: by&.id, source: "manual", branch_id: employee.branch_id)
      a.save!
      a
    end

    # Fills absences for working days without a record (run nightly, or at payroll time).
    def fill_absences!(from:, to:)
      count = 0
      Employee.active.find_each do |e|
        rule = e.rule
        leaves = LeaveRequest.where(employee_id: e.id, status: "approved")
        hols = Holiday.where("branch_id IS NULL OR branch_id = ?", e.branch_id).pluck(:on_date).to_set
        (from..to).each do |d|
          next unless e.active_on?(d) && rule.working_day?(d)
          next if ::Attendance.exists?(employee_id: e.id, business_day: d)
          status = hols.include?(d) ? "holiday" : (leaves.any? { |l| l.covers?(d) } ? "leave" : "absent")
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
      { present: rows.where(status: %w[present half_day]).count, half_days: rows.where(status: "half_day").count, absent: rows.where(status: "absent").count, leave: rows.where(status: "leave").count, unpaid_leave: unpaid_leave_days,
        holiday: rows.where(status: "holiday").count, late_minutes: rows.sum(:late_minutes), late_days: rows.where("late_minutes > 0").count, fines_minor: rows.sum(:fine_minor), worked_minutes: rows.sum(:worked_minutes) }
    end
  end
end

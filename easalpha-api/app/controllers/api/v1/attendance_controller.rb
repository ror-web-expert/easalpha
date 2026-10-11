module Api
  module V1
    class AttendanceController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("payroll.manage", "PAYROLL", "staff.manage", "shifts.any", "app.pos") }, except: :scan
      before_action -> { require_permission!("payroll.manage", "PAYROLL", "staff.manage", "shifts.any", "app.pos", "app.kitchen") }, only: :scan
      before_action :read_only_guard!, except: %i[index summary today scans ledger reports enrolled]

      # GET /attendance/today  SPEC Today: total scans, currently in, checked out, not checked in and late, against the business date
      def today
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current)
        rows = ::Attendance.includes(:employee).where(business_day: day).to_a
        employees = Employee.active.select { |e| e.active_on?(day) }
        in_now = rows.count(&:open?)
        render json: { business_day: day, counters: { scans: AttendanceScan.where(scanned_at: current_branch.business_day_end_at(day - 1)..current_branch.business_day_end_at(day)).count, currently_in: in_now,
                                                      checked_out: rows.count { |a| a.checked_out_at.present? }, not_checked_in: employees.count { |e| rows.none? { |a| a.employee_id == e.id && a.checked_in_at } },
                                                      late: rows.count { |a| a.status == "late" }, half_day: rows.count { |a| a.status == "half_day" }, absent: rows.count { |a| a.status == "absent" } },
                       data: rows.sort_by { |a| a.checked_in_at || Time.at(0) }.map { |a| PayrollSerializers.attendance(a) },
                       not_checked_in: employees.reject { |e| rows.any? { |a| a.employee_id == e.id && a.checked_in_at } }.map { |e| { id: e.id, name: e.name, designation: e.designation } } }
      end

      # GET /attendance/scans?from=&to=&employee_id=&result=  SPEC Scan Log: every tap on the reader
      def scans
        scope = AttendanceScan.includes(:employee).order(scanned_at: :desc)
        scope = scope.where(scanned_at: Date.parse(params[:from]).beginning_of_day..) if params[:from].present?
        scope = scope.where(scanned_at: ..Date.parse(params[:to]).end_of_day) if params[:to].present?
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        scope = scope.where(result: params[:result]) if params[:result].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :scanned_at)
        render_page(rows, cursor) { |x| PayrollSerializers.scan(x) }
      end

      # POST /attendance/scan { fingerprint_id | employee_id }  the kiosk: one tap checks in or out; "Already Marked" inside the gap
      def scan
        employee = params[:employee_id].present? ? Employee.active.find(params[:employee_id]) : nil
        r = Payroll::Attendance.scan!(fingerprint_id: params[:fingerprint_id], employee: employee, branch: current_branch, device: current_device, source: params[:source].presence_in(%w[fingerprint manual pin]) || "fingerprint")
        render json: { result: r[:result], message: r[:result] == "already_marked" ? "Already Marked" : r[:result].humanize, attendance: PayrollSerializers.attendance(r[:attendance]), employee: { id: r[:employee].id, name: r[:employee].name } }
      end

      # GET /attendance/enrolled   POST /attendance/enrol { employee_id, fingerprint_id }   POST /attendance/revoke { employee_id }  (SPEC Enrolled)
      def enrolled
        render json: { data: Employee.active.order(:name).map { |e| { id: e.id, name: e.name, designation: e.designation, fingerprint_enrolled: e.fingerprint_enrolled, fingerprint_id: e.fingerprint_id, enrolled_at: e.fingerprint_enrolled_at, revoked_at: e.fingerprint_revoked_at } } }
      end

      def enrol
        require_permission!("payroll.manage", "PAYROLL", "staff.manage")
        e = Employee.active.find(params.require(:employee_id))
        fid = params.require(:fingerprint_id).to_s
        raise Api::Errors::Conflict.new("attendance.fingerprint_taken", "That fingerprint is enrolled for another employee") if Employee.active.where(fingerprint_id: fid).where.not(id: e.id).exists?
        e.update!(fingerprint_id: fid, fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current, fingerprint_revoked_at: nil)
        render json: PayrollSerializers.employee(e)
      end

      def revoke
        require_permission!("payroll.manage", "PAYROLL", "staff.manage")
        e = Employee.active.find(params.require(:employee_id))
        e.update!(fingerprint_enrolled: false, fingerprint_revoked_at: Time.current, fingerprint_id: nil)
        render json: PayrollSerializers.employee(e)
      end

      # GET /attendance/ledger?employee_id=&month=YYYY-MM  SPEC Ledger: the month view per employee
      def ledger
        e = Employee.find(params.require(:employee_id))
        month = params[:month].present? ? Date.parse("#{params[:month]}-01") : business_today.beginning_of_month
        rows = ::Attendance.includes(:employee).where(employee_id: e.id, business_day: month..month.end_of_month).order(:business_day)
        render json: { employee: { id: e.id, name: e.name }, month: month, days: rows.map { |a| PayrollSerializers.attendance(a) }, summary: Payroll::Attendance.month_summary(e, month), rule: PayrollSerializers.rule(e.rule) }
      end

      # GET /attendance/reports?month=YYYY-MM  per employee: present, late, half days, absents, overtime, fines, lost days
      def reports
        month = params[:month].present? ? Date.parse("#{params[:month]}-01") : business_today.beginning_of_month
        rows = Employee.active.order(:name).map { |e| { employee: { id: e.id, name: e.name, designation: e.designation, department: e.department&.name }, summary: Payroll::Attendance.month_summary(e, month) } }
        totals = %i[present late half_days absent leave holiday overtime_minutes fines_minor missing_punches].index_with { |k| rows.sum { |r| r[:summary][k] } }
        render json: { month: month, rows: rows, totals: totals.merge(lost_days: rows.sum { |r| r[:summary][:lost_days] }) }
      end

      # POST /attendance/auto_close { business_day? }  closes everyone still checked in at the end of the day
      def auto_close
        require_permission!("payroll.manage", "PAYROLL")
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current) - 1
        render json: { closed: Payroll::Attendance.auto_close!(branch: current_branch, day: day) }
      end

      # GET /attendance?business_day=&from=&to=&employee_id=
      def index
        scope = ::Attendance.includes(:employee).order(business_day: :desc)
        if params[:from].present?
          scope = scope.where(business_day: Date.parse(params[:from])..Date.parse(params[:to].presence || params[:from]))
        else
          scope = scope.where(business_day: params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current))
        end
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        render json: { data: scope.limit(500).map { |a| PayrollSerializers.attendance(a) } }
      end

      # POST /attendance/check_in { employee_id | pin, source, selfie_key }   POST /attendance/check_out { employee_id }
      def check_in
        e = find_employee
        a = Payroll::Attendance.check_in!(e, source: params[:source].presence_in(%w[fingerprint selfie manual pin]) || "manual", by: current_membership, branch: current_branch, selfie_key: params[:selfie_key], device: current_device)
        render json: PayrollSerializers.attendance(a), status: :created
      end

      def check_out
        a = Payroll::Attendance.check_out!(find_employee, by: current_membership, device: current_device, manual: true) # SPEC: manual checkout is always allowed
        render json: PayrollSerializers.attendance(a)
      end

      # POST /attendance/mark { employee_id, business_day, status, note }
      def mark
        require_permission!("payroll.manage", "staff.manage")
        a = Payroll::Attendance.mark!(Employee.active.find(params.require(:employee_id)), day: Date.parse(params.require(:business_day)), status: params.require(:status), by: current_membership, note: params[:note])
        render json: PayrollSerializers.attendance(a)
      end

      def fill_absences
        require_permission!("payroll.manage")
        to = params[:to].present? ? Date.parse(params[:to]) : business_today - 1
        from = params[:from].present? ? Date.parse(params[:from]) : to.beginning_of_month
        render json: { filled: Payroll::Attendance.fill_absences!(from: from, to: to) }
      end

      # GET /attendance/summary?month=YYYY-MM
      def summary
        month = params[:month].present? ? Date.parse("#{params[:month]}-01") : business_today.beginning_of_month
        render json: { month: month, data: Employee.active.order(:name).map { |e| { employee: { id: e.id, name: e.name }, summary: Payroll::Attendance.month_summary(e, month) } } }
      end

      private

      def find_employee
        if params[:employee_id].present?
          Employee.active.find(params[:employee_id])
        elsif params[:pin].present?
          m = Membership.active.where.not(pin_digest: nil).find { |x| x.authenticate_pin(params[:pin].to_s) }
          Employee.active.find_by(membership_id: m&.id) or raise Api::Errors::NotFound.new("employee.pin", "No employee matches that PIN")
        else
          Employee.active.find_by(membership_id: current_membership.id) or raise Api::Errors::NotFound.new("employee.none", "No employee record is linked to your login")
        end
      end
    end
  end
end

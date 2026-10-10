module Api
  module V1
    class AttendanceController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("payroll.manage", "staff.manage", "shifts.any", "app.pos") }
      before_action :read_only_guard!, except: %i[index summary]

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
        a = Payroll::Attendance.check_in!(e, source: params[:source].presence_in(%w[fingerprint selfie manual pin]) || "manual", by: current_membership, branch: current_branch, selfie_key: params[:selfie_key])
        render json: PayrollSerializers.attendance(a), status: :created
      end

      def check_out
        a = Payroll::Attendance.check_out!(find_employee, by: current_membership)
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
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current - 1
        from = params[:from].present? ? Date.parse(params[:from]) : to.beginning_of_month
        render json: { filled: Payroll::Attendance.fill_absences!(from: from, to: to) }
      end

      # GET /attendance/summary?month=YYYY-MM
      def summary
        month = params[:month].present? ? Date.parse("#{params[:month]}-01") : Date.current.beginning_of_month
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

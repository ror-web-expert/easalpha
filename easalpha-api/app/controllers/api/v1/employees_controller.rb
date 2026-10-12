module Api
  module V1
    # Employees, departments, salary components, attendance rules, leave and holidays.
    class EmployeesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("payroll.manage", "staff.manage") }
      before_action -> { require_module!("payroll") }
      before_action :read_only_guard!, except: %i[index show departments components rules leaves holidays]

      def index
        scope = Employee.active.includes(:department, employee_salary_components: :salary_component).order(:name)
        scope = scope.where(department_id: params[:department_id]) if params[:department_id].present?
        scope = scope.where("name ILIKE :q OR cnic ILIKE :q OR designation ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?
        render json: { data: scope.map { |e| PayrollSerializers.employee(e) } }
      end

      def show = render(json: PayrollSerializers.employee(Employee.includes(:department, employee_salary_components: :salary_component).find(params[:id])))

      # POST /employees { name, phone, cnic, designation, department_id, branch_id, membership_id, base_salary_minor, joined_on, shares_tips, components: [{salary_component_id, amount_minor, percent}] }
      def create
        e = Employee.transaction do
          emp = Employee.create!(employee_params)
          set_components!(emp, params[:components]) if params.key?(:components)
          emp
        end
        audit!("create", record: e, after: { name: e.name, base_salary_minor: e.base_salary_minor })
        render json: PayrollSerializers.employee(e.reload), status: :created
      end

      def update
        e = Employee.active.find(params[:id])
        before = { base_salary_minor: e.base_salary_minor }
        Employee.transaction do
          e.update!(employee_params)
          set_components!(e, params[:components]) if params.key?(:components)
        end
        audit!("update", record: e, before: before, after: { base_salary_minor: e.base_salary_minor })
        render json: PayrollSerializers.employee(e.reload)
      end

      def destroy
        e = Employee.active.find(params[:id])
        e.update!(archived_at: Time.current, left_on: e.left_on || today)
        head :no_content
      end

      # Departments
      def departments = render(json: { data: Department.active.order(:name).map { |d| { id: d.id, name: d.name, employees: d.employees.where(archived_at: nil).count } } })
      def create_department = render(json: Department.create!(params.permit(:name)).slice(:id, :name), status: :created)
      def destroy_department
        Department.active.find(params[:id]).update!(archived_at: Time.current)
        head :no_content
      end

      # Salary components
      def components = render(json: { data: SalaryComponent.active.order(:kind, :name).map { |c| c.slice(:id, :name, :kind, :default_amount_minor, :is_percent, :percent) } })
      def create_component = render(json: SalaryComponent.create!(params.permit(:name, :kind, :default_amount_minor, :is_percent, :percent)).slice(:id, :name, :kind, :default_amount_minor, :is_percent, :percent), status: :created)
      def destroy_component
        SalaryComponent.active.find(params[:id]).update!(archived_at: Time.current)
        head :no_content
      end

      # Attendance rules: default (no employee) and per employee
      def rules = render(json: { data: AttendanceRule.order(Arel.sql("employee_id NULLS FIRST")).map { |r| PayrollSerializers.rule(r) } })
      def upsert_rule
        r = AttendanceRule.find_or_initialize_by(employee_id: params[:employee_id].presence)
        r.update!(params.permit(:shift_start, :shift_end, :grace_minutes, :late_fine_minor, :late_fine_after_minutes, :absent_rule, :fixed_divisor, :require_fingerprint_to_close_shift, :rules_enabled,
                                :late_after_minutes, :half_day_after_minutes, :absent_after_minutes, :overtime_enabled, :overtime_rate_minor_per_hour, :no_scan_counts_absent, :free_lates, :free_half_days, :free_absents,
                                :late_penalty, :half_day_penalty, :absent_penalty, :half_day_fine_minor, :absent_fine_minor, :fine_cap_minor, :checkout_gap_minutes, working_days: []))
        audit!("settings_change", record: r, after: PayrollSerializers.rule(r))
        render json: PayrollSerializers.rule(r)
      end

      # Leave
      def leaves
        scope = LeaveRequest.includes(:employee).order(from_date: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        render json: { data: scope.limit(200).map { |l| PayrollSerializers.leave(l) } }
      end
      def create_leave
        l = LeaveRequest.create!(params.permit(:employee_id, :kind, :from_date, :to_date, :reason))
        render json: PayrollSerializers.leave(l), status: :created
      end
      def decide_leave
        l = LeaveRequest.find(params[:id])
        raise Api::Errors::Conflict.new("leave.status", "Leave is #{l.status}") unless l.status == "pending"
        l.update!(status: ActiveModel::Type::Boolean.new.cast(params[:approve]) ? "approved" : "rejected", approved_by_membership_id: current_membership.id, decided_at: Time.current)
        render json: PayrollSerializers.leave(l)
      end

      # Holidays
      def holidays = render(json: { data: Holiday.order(:on_date).map { |h| PayrollSerializers.holiday(h) } })
      def create_holiday = render(json: PayrollSerializers.holiday(Holiday.create!(params.permit(:branch_id, :name, :on_date, :paid))), status: :created)
      def destroy_holiday
        Holiday.find(params[:id]).destroy!
        head :no_content
      end

      private

      def employee_params = params.permit(:name, :phone, :cnic, :designation, :department_id, :branch_id, :membership_id, :base_salary_minor, :pay_frequency, :joined_on, :left_on, :fingerprint_enrolled, :shares_tips, :notes, :whatsapp_notify)

      def set_components!(emp, comps)
        emp.employee_salary_components.destroy_all
        Array(comps).each do |c|
          c = c.respond_to?(:to_unsafe_h) ? c.to_unsafe_h : c.to_h
          emp.employee_salary_components.create!(salary_component_id: c["salary_component_id"], amount_minor: c["amount_minor"].presence, percent: c["percent"].presence)
        end
      end
    end
  end
end

module Api
  module V1
    class PayrollController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("payroll.manage", "PAYROLL") }
      before_action :read_only_guard!, except: %i[runs show_run advances payslip overview ledger reports settings]

      # GET /payroll/overview  SPEC: total employees, pending advances, whether this month's payroll is generated, outstanding advances
      def overview
        month = today.beginning_of_month
        run = PayrollRun.where(month: month).where.not(status: "cancelled").order(created_at: :desc).first
        render json: { month: month, employees: Employee.active.count, pending_advances: Advance.where(status: "pending").count, pending_advances_minor: Advance.where(status: "pending").sum(:amount_minor),
                       month_generated: run.present?, run: run && PayrollSerializers.run(run), outstanding_advances: Advance.where(status: "paid").where("outstanding_minor > 0").count,
                       outstanding_advances_minor: Advance.where(status: "paid").where("outstanding_minor > 0").sum(:outstanding_minor),
                       last_paid_run: PayrollRun.where(status: "paid").order(month: :desc).first&.then { |r| PayrollSerializers.run(r) },
                       departments: Department.order(:name).map { |d| { id: d.id, name: d.name, employees: Employee.active.where(department_id: d.id).count } } }
      end

      # GET /payroll/ledger?employee_id=&from=YYYY-MM&to=YYYY-MM  every payslip per employee across runs
      def ledger
        scope = Payslip.includes(:employee, :payroll_run).joins(:payroll_run).where.not(payroll_runs: { status: "cancelled" }).order("payroll_runs.month DESC")
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        scope = scope.where(payroll_runs: { month: Date.parse("#{params[:from]}-01").. }) if params[:from].present?
        scope = scope.where(payroll_runs: { month: ..Date.parse("#{params[:to]}-01").end_of_month }) if params[:to].present?
        rows = scope.limit(500).to_a
        render json: { data: rows.map { |p| PayrollSerializers.payslip(p).merge(month: p.payroll_run.month, run_label: p.payroll_run.label, run_status: p.payroll_run.status) },
                       totals: { gross_minor: rows.sum { |p| p.base_minor + p.earnings_minor }, deductions_minor: rows.sum { |p| p.deductions_minor + p.absence_minor + p.late_fines_minor + p.advances_recovered_minor }, net_minor: rows.sum(&:net_minor) } }
      end

      # GET /payroll/reports?from=YYYY-MM&to=YYYY-MM  payroll cost by month and by department
      def reports
        to = params[:to].present? ? Date.parse("#{params[:to]}-01") : today.beginning_of_month
        from = params[:from].present? ? Date.parse("#{params[:from]}-01") : to - 5.months
        runs = PayrollRun.where(month: from..to).where.not(status: "cancelled").order(:month)
        slips = Payslip.includes(employee: :department).where(payroll_run_id: runs.select(:id)).to_a
        by_month = runs.map { |r| { month: r.month, label: r.label, status: r.status, employees: r.employees_count, gross_minor: r.gross_minor, deductions_minor: r.deductions_minor, net_minor: r.net_minor } }
        by_department = slips.group_by { |p| p.employee.department&.name || "No department" }.map { |d, ps| { department: d, employees: ps.map(&:employee_id).uniq.size, net_minor: ps.sum(&:net_minor), fines_minor: ps.sum(&:late_fines_minor), absence_minor: ps.sum(&:absence_minor) } }
        render json: { from: from, to: to, by_month: by_month, by_department: by_department.sort_by { |r| -r[:net_minor] },
                       totals: { net_minor: by_month.sum { |r| r[:net_minor] }, gross_minor: by_month.sum { |r| r[:gross_minor] }, fines_minor: slips.sum(&:late_fines_minor), absence_minor: slips.sum(&:absence_minor), advances_recovered_minor: slips.sum(&:advances_recovered_minor) } }
      end

      # GET/PATCH /payroll/settings  SPEC: salary calculation method and Require fingerprint to close shift, with the worked example
      def settings
        render json: settings_payload
      end

      def update_settings
        require_permission!("payroll.manage", "settings.manage")
        r = AttendanceRule.find_or_initialize_by(employee_id: nil)
        attrs = {}
        attrs[:absent_rule] = params[:salary_method] == "fixed_divisor" ? "fixed_26" : "calendar_days" if params.key?(:salary_method)
        attrs[:fixed_divisor] = params[:fixed_divisor].to_i if params[:fixed_divisor].present?
        attrs[:require_fingerprint_to_close_shift] = ActiveModel::Type::Boolean.new.cast(params[:require_fingerprint_to_close_shift]) if params.key?(:require_fingerprint_to_close_shift)
        r.update!(attrs)
        audit!("settings_change", record: r, after: attrs)
        render json: settings_payload
      end

      def runs = render(json: { data: PayrollRun.order(month: :desc).map { |r| PayrollSerializers.run(r) } })
      def show_run
        run = PayrollRun.find(params[:id])
        render json: PayrollSerializers.run(run).merge(payslips: run.payslips.includes(:employee).order("employees.name").map { |p| PayrollSerializers.payslip(p) })
      end

      # POST /payroll/runs { month: "YYYY-MM", branch_id?, notes }
      def generate
        month = Date.parse("#{params.require(:month)}-01")
        branch = params[:branch_id].present? ? Branch.active.find(params[:branch_id]) : nil
        run = Payroll::Runner.generate!(month: month, actor: current_membership, branch: branch, notes: params[:notes])
        render json: PayrollSerializers.run(run).merge(payslips: run.payslips.includes(:employee).map { |p| PayrollSerializers.payslip(p) }), status: :created
      end

      def pay
        run = PayrollRun.find(params[:id])
        approver = require_approval!("payroll.manage")
        Payroll::Runner.pay!(run, actor: current_membership, branch: current_branch, method_code: params[:method_code].presence || "cash")
        audit!("payroll_pay", record: run, approved_by: approver&.user)
        render json: PayrollSerializers.run(run.reload)
      end

      def cancel_run
        run = PayrollRun.find(params[:id])
        raise Api::Errors::Conflict.new("payroll.status", "A paid payroll cannot be cancelled") if run.status == "paid"
        run.update!(status: "cancelled")
        render json: PayrollSerializers.run(run)
      end

      def payslip = render(json: PayrollSerializers.payslip(Payslip.includes(:employee).find(params[:id])))

      private

      def settings_payload
        r = AttendanceRule.find_by(employee_id: nil) || AttendanceRule.new
        sample = 3_000_000 # Rs 30,000, the SPEC's worked example
        { salary_method: r.absent_rule == "fixed_26" ? "fixed_divisor" : "calendar_days", fixed_divisor: r.fixed_divisor, require_fingerprint_to_close_shift: r.require_fingerprint_to_close_shift,
          example: { salary_minor: sample, february_day_minor: (BigDecimal(sample) / 28).round, january_day_minor: (BigDecimal(sample) / 31).round, fixed_day_minor: (BigDecimal(sample) / r.fixed_divisor).round },
          defaults_rule: PayrollSerializers.rule(r) }
      end

      public

      # Advances
      def advances
        scope = Advance.includes(:employee).order(requested_on: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        render json: { data: scope.limit(200).map { |a| PayrollSerializers.advance(a) } }
      end

      def create_advance
        a = Payroll::Advances.request!(Employee.active.find(params.require(:employee_id)), amount_minor: params.require(:amount_minor).to_i, reason: params[:reason], by: current_membership, installment_minor: params[:installment_minor].presence&.to_i)
        render json: PayrollSerializers.advance(a), status: :created
      end

      def decide_advance
        a = Payroll::Advances.decide!(Advance.find(params[:id]), approve: ActiveModel::Type::Boolean.new.cast(params[:approve]), by: current_membership)
        render json: PayrollSerializers.advance(a)
      end

      def pay_advance
        a = Payroll::Advances.pay!(Advance.find(params[:id]), actor: current_membership, branch: current_branch, shift: current_shift, method_code: params[:method_code].presence || "cash")
        render json: PayrollSerializers.advance(a)
      end
    end
  end
end

module Api
  module V1
    class PayrollController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("payroll.manage") }
      before_action :read_only_guard!, except: %i[runs show_run advances payslip]

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

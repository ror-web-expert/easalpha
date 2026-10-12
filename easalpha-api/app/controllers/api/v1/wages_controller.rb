module Api
  module V1
    # Daily and weekly wages and the employee statement. Paying wages needs wages.pay (managers have it) or payroll.
    class WagesController < BaseController
      before_action -> { require_permission!("wages.pay", "payroll.manage", "PAYROLL") }
      before_action -> { require_module!("payroll") }
      before_action :read_only_guard!, only: %i[pay pay_batch void send_statement]

      # GET /wages/employees  a light list for the wage screens' pickers. Payroll managers see everyone; a manager who
      # may only pay wages (wages.pay) sees daily and weekly staff, never monthly salaries.
      def employees
        scope = Employee.active.order(:name)
        scope = scope.where(pay_frequency: %w[daily weekly]) unless full_payroll?
        render json: { scope: full_payroll? ? "all" : "wage_staff",
                       data: scope.map { |e| { id: e.id, name: e.name, designation: e.designation, pay_frequency: e.pay_frequency, has_phone: e.phone.present?,
                                               rate_minor: full_payroll? || e.wage_earner? ? e.base_salary_minor : nil } } }
      end

      # GET /wages/due?day=  daily employees for the day and weekly employees for its week, with what is suggested and what is paid
      def due
        day = params[:day].present? ? Date.parse(params[:day]) : today
        render json: { day: day, data: Payroll::Wages.due(day: day) }
      end

      # GET /wages/preview?employee_id=&from=&to=
      def preview
        e = Employee.active.find(params.require(:employee_id))
        from, to = period(e)
        render json: Payroll::Wages.preview(e, from: from, to: to)
      end

      # GET /wages?employee_id=&from=&to=&status=
      def index
        scope = WagePayment.includes(:employee).order(paid_at: :desc)
        scope = scope.where(employee_id: params[:employee_id]) if params[:employee_id].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(period_to: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(period_from: ..Date.parse(params[:to])) if params[:to].present?
        rows = scope.limit(500).to_a
        paid = rows.select(&:paid?)
        render json: { data: rows.map { |w| Payroll::Wages.serialize(w) }, totals: { count: paid.size, net_minor: paid.sum(&:net_minor), gross_minor: paid.sum(&:gross_minor), advance_recovered_minor: paid.sum(&:advance_recovered_minor) } }
      end

      # POST /wages { employee_id, from?, to?, days_worked?, gross_minor?, bonus_minor?, deductions_minor?, advance_recovery_minor?, method_code?, note? }
      def pay
        e = Employee.active.find(params.require(:employee_id))
        render json: Payroll::Wages.serialize(pay_one(e, params)), status: :created
      end

      # POST /wages/batch { day, rows: [{ employee_id, days_worked?, gross_minor?, bonus_minor?, deductions_minor?, advance_recovery_minor? }], method_code? }
      # Pay wages at day end: each row is paid on its own, so one problem does not stop the rest.
      def pay_batch
        day = params[:day].present? ? Date.parse(params[:day]) : today
        results = Array(params.require(:rows)).map do |r|
          e = Employee.active.find(r[:employee_id])
          from, to = e.pay_frequency == "daily" ? [ day, day ] : [ day.beginning_of_week, day.end_of_week ]
          w = pay_one(e, r.merge(from: from.to_s, to: to.to_s, method_code: r[:method_code].presence || params[:method_code]))
          { employee_id: e.id, ok: true, wage: Payroll::Wages.serialize(w) }
        rescue Api::Errors::ApiError, ActiveRecord::RecordNotFound, ActiveRecord::RecordInvalid => err
          { employee_id: r[:employee_id], ok: false, error: err.message }
        end
        render json: { day: day, results: results, paid: results.count { |x| x[:ok] }, failed: results.count { |x| !x[:ok] } }, status: :created
      end

      # POST /wages/:id/void { reason }
      def void
        require_permission!("payroll.manage", "PAYROLL", "wages.pay")
        w = Payroll::Wages.void!(WagePayment.find(params[:id]), reason: params[:reason], actor: current_membership)
        render json: Payroll::Wages.serialize(w)
      end

      # GET /employees/:id/statement?from=&to=  (default: this month)
      def statement
        e = statement_employee
        render json: Payroll::Statement.build(e, from: range.first, to: range.last)
      end

      # POST /employees/:id/send_statement { from?, to? }
      def send_statement
        e = statement_employee
        msgs = Payroll::Notify.statement!(e, Payroll::Statement.build(e, from: range.first, to: range.last))
        audit!("create", table_name: "whatsapp_messages", after: { employee_statement: e.name, to: msgs.map(&:to_phone) })
        render json: { sent: msgs.size, to: msgs.map(&:to_phone) }, status: :created
      end

      private

      def full_payroll? = current_membership.can?("payroll.manage") || current_membership.can?("PAYROLL")

      # Salary statements stay with payroll managers; wages.pay alone opens daily and weekly staff only.
      def statement_employee
        e = Employee.find(params[:id])
        raise Api::Errors::Forbidden.new("permission.denied", "Salary statements need the payroll permission") if e.monthly? && !full_payroll?
        e
      end

      def period(e)
        if params[:from].present?
          [ Date.parse(params[:from]), params[:to].present? ? Date.parse(params[:to]) : Date.parse(params[:from]) ]
        else
          e.pay_frequency == "daily" ? [ today, today ] : [ today.beginning_of_week, today.end_of_week ]
        end
      end

      def pay_one(e, p)
        from = p[:from].present? ? Date.parse(p[:from].to_s) : (e.pay_frequency == "daily" ? today : today.beginning_of_week)
        to = p[:to].present? ? Date.parse(p[:to].to_s) : (e.pay_frequency == "daily" ? from : from.end_of_week)
        num = ->(k) { p[k].presence && p[k].to_s }
        Payroll::Wages.pay!(e, from: from, to: to, actor: current_membership, branch: current_branch, shift: current_shift,
                               days_worked: num.(:days_worked), gross_minor: num.(:gross_minor)&.to_i, bonus_minor: p[:bonus_minor].to_i, deductions_minor: p[:deductions_minor].to_i,
                               advance_recovery_minor: p[:advance_recovery_minor].to_i, method_code: p[:method_code].presence || "cash", note: p[:note])
      end
    end
  end
end

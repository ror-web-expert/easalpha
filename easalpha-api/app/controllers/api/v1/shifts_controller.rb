module Api
  module V1
    class ShiftsController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!, except: %i[index show current z_report my_till day_end_settlements]

      def index
        require_permission!("shifts.any", "reports.view_all", "reports.view_branch", "shifts.own")
        scope = Shift.where(branch_id: current_branch.id).order(opened_at: :desc)
        scope = scope.where(cashier_membership_id: current_membership.id) unless current_membership.can?("shifts.any") || current_membership.can?("reports.view_all") || current_membership.can?("reports.view_branch")
        scope = scope.where(business_day: params[:business_day]) if params[:business_day].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :opened_at)
        render_page(rows, cursor) { |s| ShiftSerializers.shift(s) }
      end

      # GET /shifts/my_till  (SPEC MY_TILL: the cashier's own till)
      def my_till
        require_permission!("MY_TILL", "shifts.own", "shifts.any")
        render json: Shifts::DayEnd.my_till(current_membership, branch: current_branch)
      end

      # GET /day_end_settlements   POST /day_end_settlements { business_day?, note?, force? }  (SPEC Day-End Settlement)
      def day_end_settlements
        require_permission!("shifts.any", "reports.view_all", "reports.view_branch")
        rows = DayEndSettlement.where(branch_id: current_branch.id).order(business_day: :desc, created_at: :desc).limit(100)
        render json: { data: rows.map { |s| ShiftSerializers.day_end_settlement(s) } }
      end

      def day_end_settle
        require_permission!("shifts.any")
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current)
        rec = Shifts::DayEnd.settle!(branch: current_branch, day: day, by: current_membership, note: params[:note], force: ActiveModel::Type::Boolean.new.cast(params[:force]))
        render json: ShiftSerializers.day_end_settlement(rec), status: :created
      end

      def current
        shift = Shift.open.find_by(cashier_membership_id: current_membership.id)
        render json: { shift: shift && ShiftSerializers.shift(shift, with_expected: current_membership.can?("shifts.any")) }
      end

      def show
        shift = find_shift
        render json: ShiftSerializers.shift(shift, with_expected: current_membership.can?("shifts.any") || !shift.open?)
      end

      # POST /shifts  opening_cash_minor, id?, client_created_at?
      def create
        require_permission!("shifts.own", "shifts.any")
        shift = Shifts::Manager.open!(cashier: current_membership, branch: current_branch, device: current_device, opening_cash_minor: params[:opening_cash_minor].to_i, id: params[:id].presence, client_created_at: params[:client_created_at].presence)
        render json: ShiftSerializers.shift(shift), status: :created
      end

      # POST /shifts/:id/close  counted_cash_minor, count_detail, note, approver_pin
      def close
        shift = find_shift
        raise Api::Errors::Forbidden.new("permission.denied", "Only the cashier or a manager can close this shift") unless shift.cashier_membership_id == current_membership.id || current_membership.can?("shifts.any")
        approver = current_membership.can?("shifts.any") ? nil : (params[:approver_pin].present? ? require_approval!("shifts.any") : nil)
        detail = params[:count_detail].respond_to?(:to_unsafe_h) ? params[:count_detail].to_unsafe_h : {}
        if BusinessModules.on?(current_business, "payroll") && (emp = Employee.active.find_by(membership_id: shift.cashier_membership_id)) && emp.rule.require_fingerprint_to_close_shift
          day = current_branch.business_day_for(Time.current)
          raise Api::Errors::Forbidden.new("shift.fingerprint_required", "Check in with the fingerprint device before closing the shift") unless ::Attendance.exists?(employee_id: emp.id, business_day: day, source: "fingerprint")
        end
        Shifts::Manager.close!(shift, counted_cash_minor: params.require(:counted_cash_minor).to_i, count_detail: detail, by: current_membership, approver: approver, note: params[:note], force: ActiveModel::Type::Boolean.new.cast(params[:force]) && current_membership.can?("shifts.any"))
        render json: ShiftSerializers.shift(shift.reload, with_expected: true)
      end

      # POST /shifts/:id/approve  a manager confirms the over or short figure
      def approve
        require_permission!("shifts.any")
        shift = find_shift
        raise Api::Errors::Conflict.new("shift.open", "Close the shift first") if shift.open?
        shift.update!(approved_by_membership_id: current_membership.id)
        audit!("approve", record: shift, after: { over_short_minor: shift.over_short_minor })
        render json: ShiftSerializers.shift(shift, with_expected: true)
      end

      def settle
        require_permission!("shifts.any")
        render json: ShiftSerializers.shift(Shifts::Manager.settle!(find_shift, by: current_membership), with_expected: true)
      end

      # POST /shifts/:id/cash_movements  kind (cash_in|cash_out|payout|drop), amount_minor, reason, reference, approver_pin, id?
      def cash_movement
        require_permission!("cash.in_out", "shifts.any")
        shift = find_shift
        raise Api::Errors::Forbidden.new("permission.denied", "Not your shift") unless shift.cashier_membership_id == current_membership.id || current_membership.can?("shifts.any")
        kind = params.require(:kind).to_s
        raise Api::Errors::BadRequest.new("cash.kind", "kind must be cash_in, cash_out, payout or drop") unless kind.in?(%w[cash_in cash_out payout drop])
        approver = kind == "cash_in" || current_membership.can?("shifts.any") ? nil : (params[:approver_pin].present? ? require_approval!("shifts.any") : nil)
        mv = Shifts::Manager.cash_movement!(shift, kind: kind, amount_minor: params.require(:amount_minor).to_i, reason: params[:reason].to_s, by: current_membership, approver: approver, reference: params[:reference], id: params[:movement_id].presence)
        render json: { movement: ShiftSerializers.movement(mv), shift: ShiftSerializers.shift(shift.reload) }, status: :created
      end

      def z_report
        shift = find_shift
        raise Api::Errors::Forbidden.new("permission.denied", "Not your shift") unless shift.cashier_membership_id == current_membership.id || current_membership.can?("shifts.any") || current_membership.can?("reports.view_all")
        render json: shift.open? ? Shifts::ZReport.build(shift) : shift.z_report
      end

      private

      def find_shift = Shift.where(branch_id: current_branch.id).find(params[:id])
    end
  end
end

module Api
  module V1
    class PaymentsController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!

      # POST /orders/:order_id/payments  payments: [...], tip_minor
      def create
        require_permission!("payments.take")
        order = Order.includes(items: :modifiers).find(params[:id])
        result = Payments::Processor.new(order, actor: current_membership, device: current_device, shift: current_shift).call(payments: payments_param, tip_minor: params[:tip_minor].to_i)
        render json: { order: OrderSerializers.full(result.order), payments: result.payments.map { |p| PaymentSerializers.payment(p) }, change_minor: result.change_minor,
                       receipt: result.order.payment_status == "paid" ? Receipts::Builder.build(result.order) : nil }, status: :created
      end

      # POST /orders/:order_id/refunds  amount_minor, method_code, reason, approver_pin
      def refund
        require_permission!("orders.create", "orders.refund")
        order = Order.find(params[:id])
        approver = require_approval!("orders.refund")
        refund = Payments::Refunder.call(order, amount_minor: params.require(:amount_minor).to_i, method_code: params.require(:method_code), reason: params.require(:reason),
                                         actor: current_membership, approver: approver == current_membership ? nil : approver, device: current_device, shift: current_shift, id: params[:refund_id].presence)
        render json: { refund: PaymentSerializers.refund(refund), order: OrderSerializers.full(order.reload) }, status: :created
      end

      def index
        require_permission!("payments.take", "reports.view_all", "reports.view_branch")
        scope = Payment.where(branch_id: current_branch.id).order(received_at: :desc)
        scope = scope.where(business_day: params[:business_day]) if params[:business_day].present?
        scope = scope.where(method_code: params[:method_code]) if params[:method_code].present?
        scope = scope.where(shift_id: params[:shift_id]) if params[:shift_id].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :received_at)
        render_page(rows, cursor) { |p| PaymentSerializers.payment(p) }
      end

      private

      def payments_param
        raw = params[:payments]
        raw = raw.to_unsafe_h.values if raw.respond_to?(:to_unsafe_h)
        Array(raw).map { |p| p.respond_to?(:to_unsafe_h) ? p.to_unsafe_h : p.to_h }
      end

      def current_shift = Shift.open.find_by(cashier_membership_id: current_membership.id)
    end
  end
end

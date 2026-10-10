module Api
  module V1
    # Cashier side of QR ordering: pending orders to accept or reject, and table requests to handle.
    class QrOrdersController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("orders.create", "kitchen.view") }
      before_action :read_only_guard!, except: %i[index requests]

      # GET /qr_orders?status=pending
      def index
        scope = Order.includes(:dining_table, :items).where(branch_id: current_branch.id, source: "qr").where.not(qr_status: nil).order(created_at: :desc)
        scope = scope.where(qr_status: params[:status].presence || "pending")
        scope = scope.on_day(current_branch.business_day_for(Time.current)) unless params[:all_days] == "true"
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |o| OrderSerializers.summary(o).merge(qr_status: o.qr_status, guest_name: o.guest_name) }
      end

      def accept
        order = Order.find(params[:id])
        Qr::Ordering.accept!(order, actor: current_membership, device: current_device)
        audit!("qr_accept", record: order)
        render json: OrderSerializers.full(order.reload)
      end

      def reject
        order = Order.find(params[:id])
        Qr::Ordering.reject!(order, actor: current_membership, reason: params[:reason].presence || "not accepted")
        audit!("qr_reject", record: order, after: { reason: params[:reason] })
        render json: OrderSerializers.full(order.reload)
      end

      # GET /qr_orders/requests?open=true
      def requests
        scope = TableRequest.includes(:table).where(branch_id: current_branch.id).order(requested_at: :desc)
        scope = scope.open if params[:open] != "false"
        render json: { data: scope.limit(200).map { |r| { id: r.id, table_id: r.table_id, table_code: r.table.code, kind: r.kind, guest_name: r.guest_name, note: r.note, requested_at: r.requested_at, handled_at: r.handled_at, handled_by_membership_id: r.handled_by_membership_id } } }
      end

      def handle_request
        r = TableRequest.find(params[:id])
        r.update!(handled_at: Time.current, handled_by_membership_id: current_membership.id) if r.handled_at.nil?
        render json: { id: r.id, handled_at: r.handled_at }
      end
    end
  end
end

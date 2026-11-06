module Api
  module V1
    # Cashier side of QR ordering: pending orders to accept or reject, and table requests to handle.
    class QrOrdersController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("orders.create", "kitchen.view") }
      before_action :read_only_guard!, except: %i[index requests]

      # GET /qr_orders?status=pending
      def index
        # QR table orders and website orders share the accept-or-reject queue; ?source=qr|online narrows it. A guest's
        # round on a table a waiter opened at the till waits here too (F4): qr_status is set only by guests' orders.
        status = params[:status].presence || "pending"
        scope = Order.includes(:dining_table, :items, :address, :customer).where(branch_id: current_branch.id).where.not(qr_status: nil).order(created_at: :desc)
        scope = scope.where(source: params[:source] == "qr" ? %w[qr till] : params[:source]) if params[:source].present?
        scope = scope.where(qr_status: status)
        today = current_branch.business_day_for(Time.current)
        # What waits is shown from yesterday's business day too: a round added after the day ended, to an order begun before.
        scope = status == "pending" ? scope.where(business_day: (today - 1)..) : scope.on_day(today) unless params[:all_days] == "true"
        rows, cursor = paginate(scope)
        render_page(rows, cursor) do |o|
          OrderSerializers.summary(o).merge(qr_status: o.qr_status, guest_name: o.guest_name, address_text: o.address&.to_s.presence || o.delivery_address, guest_phone: o.guest_phone, notes: o.notes,
                                            waiting_items: Qr::Ordering.waiting_round(o, o.items).map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F").sub(/\.0+\z/, "") } })
        end
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

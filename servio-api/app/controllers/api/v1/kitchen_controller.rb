module Api
  module V1
    # The kitchen display reads tickets per station and bumps items or whole orders.
    class KitchenController < BaseController
      before_action :require_kitchen!

      # GET /kitchen/orders?station_id=  active orders with their items for this station
      def orders
        scope = Order.includes(items: :modifiers).where(branch_id: current_branch.id).in_kitchen.due_in_kitchen.order(:placed_at)
        orders = scope.map do |o|
          items = o.items.reject(&:cancelled?)
          items = items.select { |i| i.station_id == params[:station_id] || (i.deal_components.any? { |c| c["station_id"] == params[:station_id] }) } if params[:station_id].present?
          next if items.empty?
          OrderSerializers.summary(o).merge(items: items.map { |i| OrderSerializers.item(i) }, elapsed_seconds: (Time.current - (o.placed_at || o.created_at)).to_i)
        end.compact
        render json: { data: orders, server_time: Time.current }
      end

      # GET /kitchen/tickets?station_id=&unprinted=true  tickets for printing or the KDS log
      def tickets
        scope = KitchenTicket.where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.where(station_id: params[:station_id]) if params[:station_id].present?
        scope = scope.unprinted if params[:unprinted] == "true"
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |t| OrderSerializers.ticket(t) }
      end

      def ticket_printed
        t = KitchenTicket.where(branch_id: current_branch.id).find(params[:id])
        t.update!(printed_at: Time.current)
        render json: OrderSerializers.ticket(t)
      end

      def start
        order = Order.find(params[:id])
        Orders::Transitions.start!(order, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # POST /kitchen/orders/:id/bump   whole order ready
      def bump
        order = Order.find(params[:id])
        Orders::Transitions.ready!(order, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # POST /kitchen/items/:id/bump   one line ready; the order becomes ready when every line is
      def bump_item
        item = OrderItem.includes(:order).find(params[:id])
        raise Api::Errors::Conflict.new("item.status", "Item is #{item.status}") unless item.status.in?(%w[sent preparing])
        item.update!(status: "ready", bumped_at: Time.current)
        order = item.order
        Orders::Transitions.start!(order, actor: current_membership, device: current_device) if order.status == "placed"
        Orders::Transitions.ready!(order.reload, actor: current_membership, device: current_device) if order.active_items.all? { |i| i.status.in?(%w[ready served]) }
        Realtime.kitchen_changed(order.branch_id, order.business_id)
        render json: OrderSerializers.full(order.reload)
      end

      # GET /kitchen/ready  orders ready for pickup, for the token screen
      # GET /kitchen/queue  customer queue display: orders being prepared and orders ready to collect
      def queue
        base = Order.where(branch_id: current_branch.id)
        row = ->(o) { { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, guest_name: o.guest_name, status: o.status, placed_at: o.placed_at, ready_at: o.ready_at } }
        render json: { preparing: base.where(status: %w[placed preparing]).order(:placed_at).limit(50).map(&row), ready: base.where(status: "ready").order(:ready_at).limit(50).map(&row), at: Time.current }
      end

      def ready
        orders = Order.where(branch_id: current_branch.id, status: "ready").order(:ready_at)
        render json: { data: orders.map { |o| { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, ready_at: o.ready_at } } }
      end

      private

      def require_kitchen!
        return if current_device&.paired? && current_device.kind.in?(%w[kitchen till tablet token_screen])
        require_permission!("kitchen.view", "kitchen.bump", "orders.create")
        raise Api::Errors::Forbidden.new("permission.denied", "Bumping needs kitchen.bump") if action_name.in?(%w[start bump bump_item]) && !current_membership.can?("kitchen.bump") && !current_membership.can?("orders.create")
      end
    end
  end
end

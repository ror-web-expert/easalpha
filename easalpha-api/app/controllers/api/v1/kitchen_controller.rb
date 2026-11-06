module Api
  module V1
    # The kitchen display reads tickets per station and bumps items or whole orders.
    class KitchenController < BaseController
      before_action :require_kitchen!

      # GET /kitchen/orders?station_id=&from=  active orders with their items for this station, from today's business
      # day (or the given day) on; a pre-order keeps its place until it is due whatever day it was taken
      def orders
        from = params[:from].present? ? Date.parse(params[:from].to_s) : current_branch.business_day_for(Time.current)
        scope = display_scope(from).includes(:dining_table, items: :modifiers).order(:placed_at)
        orders = scope.map do |o|
          items = o.items.reject(&:cancelled?)
          items = items.select { |i| i.station_id == params[:station_id] || (i.deal_components.any? { |c| c["station_id"] == params[:station_id] }) } if params[:station_id].present?
          next if items.empty?
          OrderSerializers.summary(o).merge(items: items.map { |i| OrderSerializers.item(i) }, elapsed_seconds: (Time.current - (o.placed_at || o.created_at)).to_i)
        end.compact
        render json: { data: orders, server_time: Time.current }
      rescue Date::Error
        raise Api::Errors::BadRequest.new("kitchen.from", "from must be YYYY-MM-DD")
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

      # POST /kitchen/orders/:id/bump { station_id? }   from a station's screen that station's lines are ready, and the
      # order once every station's are (F10); without a station the whole order. A second press on a ready order
      # changes nothing (the screen keeps the button on ready cards).
      def bump
        order = Order.find(params[:id])
        Orders::Transitions.bump!(order, station_id: params[:station_id].presence, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # POST /kitchen/items/:id/bump   one line ready; the order becomes ready when every station's lines are; a line
      # already bumped, or on an order already ready, is left as it is
      def bump_item
        item = OrderItem.includes(:order).find(params[:id])
        order = item.order
        return render json: OrderSerializers.full(order) if item.status.in?(%w[ready served]) || order.status == "ready"
        raise Api::Errors::Conflict.new("item.status", "Item is #{item.status}") unless item.status.in?(%w[sent preparing])
        item.update!(status: "ready", bumped_at: Time.current)
        Orders::Transitions.ready_when_stations_done!(order, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # GET /kitchen/ready  orders ready for pickup, for the token screen
      # GET /kitchen/queue  customer queue display: orders being prepared and orders ready to collect
      # The customers' screens show what the kitchen display shows (F12): a pre-order due tomorrow, or an order of an
      # earlier day still open, is not "Preparing".
      def queue
        base = display_scope
        row = ->(o) { { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, guest_name: o.guest_name, status: o.status, placed_at: o.placed_at, ready_at: o.ready_at } }
        render json: { preparing: base.where(status: %w[placed preparing]).order(:placed_at).limit(50).map(&row), ready: base.where(status: "ready").order(:ready_at).limit(50).map(&row), at: Time.current }
      end

      def ready
        orders = display_scope.where(status: "ready").order(:ready_at)
        render json: { data: orders.map { |o| { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, ready_at: o.ready_at } } }
      end

      private

      # The orders on the kitchen display (GET /kitchen/orders): in the kitchen, from the business day `from` on, and a
      # pre-order only once it is due. The queue and token screens read the same, so a change to the day rule here
      # reaches all three.
      def display_scope(from = current_branch.business_day_for(Time.current))
        Order.where(branch_id: current_branch.id).in_kitchen.due_in_kitchen.where("orders.business_day >= :from OR orders.scheduled_for IS NOT NULL", from: from)
      end

      # A device token alone opens the kitchen only for a device paired as a kitchen screen (and the ready list for a
      # token screen). A till or tablet token names nobody, so on those the display needs the cashier signed in, with
      # the kitchen permission (review of 6 Nov 2026, A8); the web sends the POS session when there is one.
      def require_kitchen!
        if current_device&.paired? && current_membership.nil?
          return if current_device.kind == "kitchen"
          # A token or queue screen faces the customers: it reads what is ready and never bumps.
          return if current_device.kind == "token_screen" && action_name.in?(%w[ready queue])
          raise Api::Errors::Forbidden.new("permission.denied", "This screen can only read the ready list") if current_device.kind == "token_screen"
          raise Api::Errors::Forbidden.new("session.required", "Sign in on the till to open the kitchen display") if current_device.kind.in?(%w[till tablet])
        end
        require_permission!("kitchen.view", "kitchen.bump", "orders.create")
        raise Api::Errors::Forbidden.new("permission.denied", "Bumping needs kitchen.bump") if action_name.in?(%w[start bump bump_item]) && !current_membership.can?("kitchen.bump") && !current_membership.can?("orders.create")
      end
    end
  end
end

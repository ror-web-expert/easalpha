module Api
  module V1
    # The kitchen display reads tickets per station and bumps items or whole orders.
    class KitchenController < BaseController
      before_action :require_kitchen!

      # An order the kitchen finished after it was paid (a takeaway paid at once) is handed over with nothing the till
      # records, so the customers' screens show it as ready for this long after the kitchen bumped it.
      READY_WINDOW = 15.minutes

      # GET /kitchen/orders?station_id=&from=  active orders with their items for this station, from the previous
      # business day (or the given day) on; a pre-order keeps its place until it is due whatever day it was taken.
      # The customer's name and phone stay off a kitchen screen, which shows neither.
      def orders
        from = params[:from].present? ? Date.parse(params[:from].to_s) : nil
        scope = display_scope(from).includes(:dining_table, :customer, items: :modifiers).order(:placed_at)
        orders = scope.map do |o|
          items = o.items.reject(&:cancelled?)
          items = items.select { |i| i.station_id == params[:station_id] || (i.deal_components.any? { |c| c["station_id"] == params[:station_id] }) } if params[:station_id].present?
          next if items.empty?
          OrderSerializers.summary(o).except(:customer_name, :customer_phone).merge(items: items.map { |i| OrderSerializers.item(i) }, elapsed_seconds: (Time.current - (o.placed_at || o.created_at)).to_i)
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

      # POST /kitchen/items/:id/bump { station_id? }  one line ready; the order becomes ready when every station's lines
      # are (an order past the kitchen keeps its status); a line already bumped is left as it is, and a line added to a
      # ready order goes ready with the order left ready. From a station's screen a deal made at several stations has
      # only that station's parts ready, and the line goes ready with its last part (L3, 7 Nov 2026).
      def bump_item
        item = OrderItem.includes(:order).find(params[:id])
        order = item.order
        return render json: OrderSerializers.full(order) if item.status.in?(%w[ready served])
        raise Api::Errors::Conflict.new("item.status", "Item is #{item.status}") unless item.status.in?(%w[sent preparing])
        station = params[:station_id].presence
        if station && Orders::Transitions.split_deal?(item) && item.deal_components.any? { |c| c["station_id"] == station }
          Orders::Transitions.bump_deal_parts!(item, station)
        else
          item.update!(status: "ready", bumped_at: Time.current)
        end
        Orders::Transitions.ready_when_stations_done!(order, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # GET /kitchen/ready  orders ready for pickup, for the token screen
      # GET /kitchen/queue  customer queue display: orders being prepared and orders ready to collect
      # The customers' screens show what the kitchen display shows (F12), judged by the lines as the display is, not by
      # the order's status: a takeaway paid at once is preparing while a line cooks and ready once the kitchen bumps it,
      # though it stays paid. A pre-order due tomorrow, or an order of an earlier day still open, is neither.
      def queue
        row = ->(o) { { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, guest_name: o.guest_name, status: o.status, placed_at: o.placed_at, ready_at: o.ready_at } }
        render json: { preparing: preparing_scope.order(:placed_at).limit(50).map(&row), ready: ready_scope.order(:ready_at).limit(50).map(&row), at: Time.current }
      end

      def ready
        orders = ready_scope.order(:ready_at)
        render json: { data: orders.map { |o| { id: o.id, serial: o.serial, label: o.label, order_type: o.order_type, ready_at: o.ready_at } } }
      end

      private

      # The orders on the kitchen display (GET /kitchen/orders): in the kitchen, from `from` on, by default the previous
      # business day, so an order still being cooked when the day ends (02:01 by default) stays on the screens instead
      # of dropping off mid-cook (final round, contracts#6), while one left unbumped days ago does not come back; a
      # pre-order only once it is due. The queue and token screens read the same, so a change to the day rule here
      # reaches all three.
      def display_scope(from = nil)
        from ||= current_branch.business_day_for(Time.current) - 1
        Order.where(branch_id: current_branch.id).in_kitchen.due_in_kitchen.where("orders.business_day >= :from OR orders.scheduled_for IS NOT NULL", from: from)
      end

      def cooking_order_ids = OrderItem.where(status: %w[sent preparing]).select(:order_id)

      # On the display with a line still cooking, whatever the order's status.
      def preparing_scope = display_scope.where(status: %w[placed preparing]).or(display_scope.where(id: cooking_order_ids))

      # Nothing left to cook: a ready order until it is served, or an order past the kitchen (paid at once or after it
      # was ready, reopened) whose lines the kitchen readied in the last READY_WINDOW and nobody has served yet.
      def ready_scope
        handed_over_late = Order.where(branch_id: current_branch.id, status: Order::AFTER_KITCHEN_STATUSES).where("orders.ready_at > ?", READY_WINDOW.ago)
                                .where(id: OrderItem.where(status: "ready").select(:order_id))
        display_scope.where(status: "ready").or(handed_over_late).where.not(id: cooking_order_ids)
      end

      # A device token alone opens the kitchen only for a device paired as a kitchen screen. A till or tablet token
      # names nobody, so on those the display needs the cashier signed in, with the kitchen permission (review of
      # 6 Nov 2026, A8); the web sends the POS session when there is one. Screens that face the customers read what
      # is being prepared and what is ready (no customer details) and never bump: a token screen, and a queue or token
      # screen opened in a second window of a till or tablet whose cashier is not signed in there (final round,
      # deploy#8: they stopped loading whenever the till locked).
      def require_kitchen!
        if current_device&.paired? && current_membership.nil?
          return if current_device.kind == "kitchen"
          return if current_device.kind.in?(%w[token_screen till tablet]) && action_name.in?(%w[ready queue])
          raise Api::Errors::Forbidden.new("permission.denied", "This screen can only read the ready list") if current_device.kind == "token_screen"
          raise Api::Errors::Forbidden.new("session.required", "Sign in on the till to open the kitchen display") if current_device.kind.in?(%w[till tablet])
        end
        require_permission!("kitchen.view", "kitchen.bump", "orders.create")
        raise Api::Errors::Forbidden.new("permission.denied", "Bumping needs kitchen.bump") if action_name.in?(%w[start bump bump_item]) && !current_membership.can?("kitchen.bump") && !current_membership.can?("orders.create")
      end
    end
  end
end

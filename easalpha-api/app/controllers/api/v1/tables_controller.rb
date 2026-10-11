module Api
  module V1
    # Floors and dining tables. The floor plan is positions stored per table; status follows the open order.
    class TablesController < BaseController
      before_action -> { require_permission!("orders.create", "tables.manage", "kitchen.view") }, only: %i[index floors]
      before_action -> { require_permission!("tables.manage") }, only: %i[create update destroy create_floor update_floor destroy_floor layout regenerate_qr]
      before_action -> { require_permission!("orders.create") }, only: %i[move merge assign_waiter]
      before_action :read_only_guard!, except: %i[index floors]

      # GET /tables?floor_id=  tables of the current branch with their open order
      def index
        scope = DiningTable.active.where(branch_id: current_branch.id).order(:code)
        scope = scope.where(floor_id: params[:floor_id]) if params[:floor_id].present?
        tables = scope.to_a
        orders = Order.open.where(id: tables.map(&:current_order_id).compact).includes(:items).index_by(&:id)
        render json: { data: tables.map { |t| CustomerSerializers.table(t, order: orders[t.current_order_id]) },
                       summary: { total: tables.size, available: tables.count { |t| t.status == "available" }, occupied: tables.count { |t| t.status == "occupied" }, seats: tables.sum(&:seats) } }
      end

      def floors
        floors = Floor.active.where(branch_id: current_branch.id).order(:sort_order)
        tables = DiningTable.active.where(branch_id: current_branch.id).group_by(&:floor_id)
        render json: { data: floors.map { |f| CustomerSerializers.floor(f, tables: tables[f.id] || []) }, unassigned: (tables[nil] || []).map { |t| CustomerSerializers.table(t) } }
      end

      def create
        t = DiningTable.create!(table_params.merge(branch_id: current_branch.id))
        audit!("create", record: t, after: { code: t.code })
        SetupChecklistItem.complete!("tables")
        render json: CustomerSerializers.table(t), status: :created
      end

      def update
        t = DiningTable.active.find(params[:id])
        t.update!(table_params)
        render json: CustomerSerializers.table(t)
      end

      def destroy
        t = DiningTable.active.find(params[:id])
        raise Api::Errors::Conflict.new("table.occupied", "Close the open order on #{t.code} first") if t.current_order_id && Order.open.exists?(id: t.current_order_id)
        t.update!(archived_at: Time.current)
        head :no_content
      end

      # PUT /tables/layout  tables: [{ id, position: {x,y,w,h}, floor_id }]
      def layout
        Array(params[:tables]).each do |row|
          t = DiningTable.active.find(row[:id])
          t.update!(position: row[:position].respond_to?(:to_unsafe_h) ? row[:position].to_unsafe_h : (row[:position] || {}), floor_id: row[:floor_id].presence || t.floor_id)
        end
        index
      end

      # GET /tables/:id/qr  the link printed on the table card
      def qr_card
        t = DiningTable.find(params[:id])
        base = ENV.fetch("EASALPHA_QR_BASE_URL", current_business.setting("qr_base_url") || "https://order.easalpha.com")
        render json: { table_id: t.id, code: t.code, token: t.qr_token, url: "#{base}/q/#{t.qr_token}", enabled: current_branch.qr_setting("enabled") }
      end

      def regenerate_qr
        t = DiningTable.active.find(params[:id])
        t.update!(qr_token: SecureRandom.urlsafe_base64(12))
        render json: CustomerSerializers.table(t)
      end

      # POST /tables/:id/move  to_table_id  moves the open order to another free table
      def move
        from = DiningTable.active.find(params[:id])
        to = DiningTable.active.find(params.require(:to_table_id))
        order = Order.open.find_by(id: from.current_order_id)
        raise Api::Errors::Conflict.new("table.empty", "#{from.code} has no open order") unless order
        raise Api::Errors::Conflict.new("table.occupied", "#{to.code} is occupied") if to.current_order_id && Order.open.exists?(id: to.current_order_id)
        DiningTable.transaction do
          order.update!(table_id: to.id)
          from.release!
          to.occupy!(order)
        end
        audit!("update", record: order, after: { moved_table: [ from.code, to.code ] })
        render json: CustomerSerializers.table(to.reload, order: order)
      end

      # POST /tables/:id/merge  into_table_id  the other table's open order absorbs this table's items
      def merge
        from = DiningTable.active.find(params[:id])
        into = DiningTable.active.find(params.require(:into_table_id))
        from_order = Order.open.find_by(id: from.current_order_id)
        into_order = Order.open.find_by(id: into.current_order_id)
        raise Api::Errors::Conflict.new("table.empty", "#{into.code} has no open order to merge into") unless into_order
        DiningTable.transaction do
          if from_order
            from_order.items.where.not(status: "cancelled").update_all(order_id: into_order.id)
            from_order.discounts.update_all(order_id: into_order.id)
            Orders::Transitions.change!(from_order, "voided", actor: current_membership, device: current_device, reason: "merged into #{into.code}")
            from_order.update!(void_reason: "merged into #{into.code}", voided_at: Time.current, table_id: nil)
            into_order.items.reset
            Orders::Pricing.recalculate!(into_order.reload)
            Orders::Pricing.save_all!(into_order)
          end
          from.update!(merged_into_table_id: into.id, status: "occupied", current_order_id: into_order.id)
        end
        audit!("update", record: into_order, after: { merged_table: from.code })
        render json: CustomerSerializers.table(into.reload, order: into_order.reload)
      end

      def assign_waiter
        t = DiningTable.active.find(params[:id])
        m = params[:membership_id].present? ? Membership.active.find(params[:membership_id]) : nil
        t.update!(waiter_membership_id: m&.id)
        Order.open.where(id: t.current_order_id).update_all(waiter_membership_id: m&.id)
        render json: CustomerSerializers.table(t)
      end

      def create_floor
        f = Floor.create!(params.permit(:name, :sort_order).merge(branch_id: current_branch.id))
        render json: CustomerSerializers.floor(f, tables: []), status: :created
      end

      def update_floor
        f = Floor.active.find(params[:id])
        f.update!(params.permit(:name, :sort_order, layout: {}))
        render json: CustomerSerializers.floor(f)
      end

      def destroy_floor
        f = Floor.active.find(params[:id])
        DiningTable.where(floor_id: f.id).update_all(floor_id: nil)
        f.update!(archived_at: Time.current)
        head :no_content
      end

      private

      # status: SPEC Maintenance (and Reserved) can be set by hand; Occupied and Available follow the orders.
      def table_params = params.permit(:code, :name, :seats, :location, :floor_id, :status, position: {})
    end
  end
end

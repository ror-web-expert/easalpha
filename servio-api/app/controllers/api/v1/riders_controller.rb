module Api
  module V1
    # Riders, their cash float (issue, return, spend, adjust, statement) and settlement at shift end.
    class RidersController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage", "orders.create", "settings.manage", "reports.view_all") }, only: %i[index show statement settlement_preview settlements deliveries]
      before_action -> { require_permission!("staff.manage", "settings.manage") }, only: %i[create update destroy]
      before_action -> { require_permission!("cash.in_out", "shifts.any", "staff.manage") }, only: %i[float settle]
      before_action :read_only_guard!, except: %i[index show statement settlement_preview settlements deliveries]

      def index
        scope = Rider.active.order(:name)
        scope = scope.where("branch_id = ? OR branch_id IS NULL", current_branch.id) unless params[:all_branches] == "true"
        scope = scope.where(status: params[:status]) if params[:status].present?
        render json: { data: scope.map { |r| DeliverySerializers.rider(r).merge(open_deliveries: Delivery.where(rider_id: r.id, status: %w[assigned picked_up on_the_way arrived]).count) } }
      end

      def show = render(json: DeliverySerializers.rider(Rider.find(params[:id])))

      # POST /riders { name, phone, vehicle, vehicle_no, address, charge_per_delivery_minor, membership_id?, create_login: true }
      def create
        r = nil
        Rider.transaction do
          attrs = rider_params
          if ActiveModel::Type::Boolean.new.cast(params[:create_login]) && attrs[:membership_id].blank?
            user = User.find_by(phone: User.normalize_phone(attrs[:phone])) || User.create!(name: attrs[:name], phone: attrs[:phone])
            m = Membership.create!(user: user, role: Role.find_by!(system_key: "rider"), status: "active", all_branches: false, branch_ids: [current_branch.id])
            m.set_pin!(params[:pin]) if params[:pin].present?
            attrs[:membership_id] = m.id
          end
          r = Rider.create!(attrs.merge(branch_id: params[:branch_id].presence || current_branch.id))
        end
        audit!("create", record: r, after: { name: r.name })
        render json: DeliverySerializers.rider(r), status: :created
      end

      def update
        r = Rider.active.find(params[:id])
        r.update!(rider_params)
        render json: DeliverySerializers.rider(r)
      end

      def destroy
        r = Rider.active.find(params[:id])
        raise Api::Errors::Conflict.new("rider.has_float", "#{r.name} still holds Rs #{r.float_minor / 100}; settle first") unless r.float_minor.zero?
        raise Api::Errors::Conflict.new("rider.has_deliveries", "#{r.name} has unsettled deliveries") if r.unsettled_deliveries.exists?
        r.update!(archived_at: Time.current, active: false, status: "offline")
        head :no_content
      end

      # POST /riders/:id/float { kind: issue|return|spend|adjust, amount_minor, reason, category_id? }
      def float
        r = Rider.active.find(params[:id])
        m = Riders::Float.move!(r, kind: params.require(:kind), amount_minor: params.require(:amount_minor).to_i, actor: current_membership, branch: current_branch, shift: current_shift, reason: params[:reason], category_id: params[:category_id].presence)
        render json: { movement: DeliverySerializers.movement(m), rider: DeliverySerializers.rider(r.reload) }, status: :created
      end

      def statement
        r = Rider.find(params[:id])
        from = params[:from].present? ? Date.parse(params[:from]) : nil
        to = params[:to].present? ? Date.parse(params[:to]) : nil
        render json: Riders::Float.statement(r, from: from, to: to)
      end

      def settlement_preview = render(json: Riders::Float.preview(Rider.find(params[:id])))

      # POST /riders/:id/settle { handed_in_minor, note, keep_float }
      def settle
        r = Rider.active.find(params[:id])
        s = Riders::Float.settle!(r, handed_in_minor: params.require(:handed_in_minor).to_i, actor: current_membership, branch: current_branch, shift: current_shift, note: params[:note], keep_float: ActiveModel::Type::Boolean.new.cast(params[:keep_float]))
        render json: { settlement: DeliverySerializers.settlement(s), rider: DeliverySerializers.rider(r.reload) }, status: :created
      end

      def settlements
        rows, cursor = Paginator.call(RiderSettlement.where(rider_id: params[:id]).includes(:rider), cursor: params[:cursor], limit: params[:limit], order_column: :settled_at)
        render_page(rows, cursor) { |s| DeliverySerializers.settlement(s) }
      end

      def deliveries
        scope = Delivery.where(rider_id: params[:id]).includes(:rider, :zone, order: :customer).order(created_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |d| DeliverySerializers.delivery(d) }
      end

      private

      def rider_params = params.permit(:name, :phone, :vehicle, :vehicle_no, :address, :charge_per_delivery_minor, :membership_id, :status, :active).to_h.symbolize_keys
    end
  end
end

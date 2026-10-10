module Api
  module V1
    # Delivery board for the till and admin, and the rider's own endpoints (app.rider).
    class DeliveriesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("orders.create", "reports.view_all", "staff.manage") }, only: %i[index show assign unassign status cash]
      before_action -> { require_permission!("app.rider") }, only: %i[mine mine_status mine_float]
      before_action :read_only_guard!, except: %i[index show mine mine_float]

      # GET /deliveries?status=&rider_id=&business_day=&open=true
      def index
        scope = Delivery.includes(:rider, :zone, order: :customer).where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.joins(:order).where(orders: { business_day: params[:business_day].presence || current_branch.business_day_for(Time.current) }) unless params[:all_days] == "true"
        scope = scope.where(status: %w[unassigned assigned picked_up on_the_way arrived]) if params[:open] == "true"
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(rider_id: params[:rider_id]) if params[:rider_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |d| DeliverySerializers.delivery(d) }
      end

      def show = render(json: DeliverySerializers.delivery(find_delivery, full: true))

      def assign
        d = find_delivery
        Deliveries::Manager.assign!(d, rider: Rider.active.find(params.require(:rider_id)), actor: current_membership)
        render json: DeliverySerializers.delivery(d.reload, full: true)
      end

      def unassign
        d = find_delivery
        Deliveries::Manager.unassign!(d, actor: current_membership)
        render json: DeliverySerializers.delivery(d.reload, full: true)
      end

      # POST /deliveries/:id/status { status, note, lat, lng, cash_collected_minor }
      def status
        d = find_delivery
        Deliveries::Manager.move!(d, to: params.require(:status), actor: current_membership, note: params[:note], lat: params[:lat], lng: params[:lng], cash_collected_minor: params[:cash_collected_minor].presence&.to_i)
        render json: DeliverySerializers.delivery(d.reload, full: true)
      end

      def cash
        d = find_delivery
        d.update!(cash_collected_minor: params.require(:cash_collected_minor).to_i)
        render json: DeliverySerializers.delivery(d.reload, full: true)
      end

      # Rider app: GET /rider/deliveries, POST /rider/deliveries/:id/status, GET /rider/float
      def mine
        rider = own_rider!
        scope = Delivery.where(rider_id: rider.id).includes(:rider, :zone, order: :customer).order(created_at: :desc)
        scope = scope.where(status: %w[assigned picked_up on_the_way arrived]) unless params[:all] == "true"
        render json: { rider: DeliverySerializers.rider(rider), data: scope.limit(100).map { |d| DeliverySerializers.delivery(d, full: true) } }
      end

      def mine_status
        rider = own_rider!
        d = Delivery.find_by!(id: params[:id], rider_id: rider.id)
        occurred = params[:occurred_at].present? ? Time.iso8601(params[:occurred_at]) : Time.current
        Deliveries::Manager.move!(d, to: params.require(:status), actor: current_membership, note: params[:note], lat: params[:lat], lng: params[:lng], cash_collected_minor: params[:cash_collected_minor].presence&.to_i, occurred_at: occurred)
        render json: DeliverySerializers.delivery(d.reload, full: true)
      end

      def mine_float
        rider = own_rider!
        render json: Riders::Float.statement(rider).merge(settlement: Riders::Float.preview(rider).except(:rider, :deliveries))
      end

      private

      def find_delivery
        params[:order_id].present? ? Delivery.find_by!(order_id: params[:order_id]) : Delivery.find(params[:id])
      end

      def own_rider!
        Rider.active.find_by(membership_id: current_membership.id) or raise Api::Errors::Forbidden.new("rider.none", "No rider profile is linked to this login")
      end
    end
  end
end

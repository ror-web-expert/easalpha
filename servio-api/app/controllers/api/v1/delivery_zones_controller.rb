module Api
  module V1
    class DeliveryZonesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("settings.manage", "orders.create", "menu.view") }, only: %i[index quote]
      before_action -> { require_permission!("settings.manage") }, except: %i[index quote]

      def index
        scope = DeliveryZone.active.where(branch_id: params[:branch_id].presence || current_branch.id).order(:charge_minor, :name)
        render json: { data: scope.map { |z| DeliverySerializers.zone(z) } }
      end

      # GET /delivery_zones/quote?text=  charge for an address text (area, city)
      def quote = render(json: Deliveries::Manager.quote(branch: current_branch, text: params[:text].to_s))

      def create
        z = DeliveryZone.create!(zone_params.merge(branch_id: params[:branch_id].presence || current_branch.id))
        render json: DeliverySerializers.zone(z), status: :created
      end

      def update
        z = DeliveryZone.active.find(params[:id])
        z.update!(zone_params)
        render json: DeliverySerializers.zone(z)
      end

      def destroy
        DeliveryZone.active.find(params[:id]).update!(archived_at: Time.current, active: false)
        head :no_content
      end

      private

      def zone_params
        p = params.permit(:name, :charge_minor, :min_order_minor, :eta_minutes, :active, areas: [], polygon: [])
        p[:areas] = Array(p[:areas]).map(&:to_s).map(&:strip).reject(&:blank?) if p.key?(:areas)
        p
      end
    end
  end
end

module Api
  module V1
    class StationsController < BaseController
      before_action :authenticate!, only: :index
      before_action -> { require_permission!("settings.manage", "menu.edit") }, except: :index

      def index
        scope = Station.active.order(:sort_order)
        scope = scope.where(branch_id: params[:branch_id]) if params[:branch_id].present?
        render json: { data: scope.map { |s| MenuSerializers.station(s) } }
      end

      def create
        s = Station.create!(params.permit(:name, :printer_name, :display_device_id, :sort_order).merge(branch: Branch.active.find(params[:branch_id].presence || current_branch.id)))
        render json: MenuSerializers.station(s), status: :created
      end

      def update
        s = Station.active.find(params[:id])
        s.update!(params.permit(:name, :printer_name, :display_device_id, :sort_order))
        render json: MenuSerializers.station(s)
      end

      def destroy
        Station.active.find(params[:id]).update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end

module Api
  module V1
    class StationsController < BaseController
      before_action :authenticate_station_reader!, only: :index
      before_action -> { require_permission!("settings.manage", "menu.edit") }, except: :index

      # A screen paired as a kitchen display reads its own branch's stations with the device token alone, as it reads
      # the kitchen's orders (F9); everyone else needs a staff session.
      def index
        scope = Station.active.order(:sort_order)
        branch_id = current_membership ? params[:branch_id].presence : current_branch.id
        scope = scope.where(branch_id: branch_id) if branch_id
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

      private

      def authenticate_station_reader!
        return if current_membership.nil? && current_device&.paired? && current_device.kind == "kitchen"
        authenticate!
      end
    end
  end
end

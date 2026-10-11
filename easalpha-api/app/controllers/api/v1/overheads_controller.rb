module Api
  module V1
    class OverheadsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("settings.manage", "expenses.manage", "finance.view") }, only: :index
      before_action -> { require_permission!("settings.manage", "expenses.manage") }, except: :index

      def index = render(json: { data: Overhead.order(:kind, :name).map { |o| DeliverySerializers.overhead(o) } })

      def create
        o = Overhead.create!(params.permit(:branch_id, :name, :kind, :amount_minor, :basis, :active))
        render json: DeliverySerializers.overhead(o), status: :created
      end

      def update
        o = Overhead.find(params[:id])
        o.update!(params.permit(:branch_id, :name, :kind, :amount_minor, :basis, :active))
        render json: DeliverySerializers.overhead(o)
      end

      def destroy
        Overhead.find(params[:id]).destroy!
        head :no_content
      end
    end
  end
end

module Api
  module V1
    class CustomerGroupsController < BaseController
      before_action -> { require_permission!("customers.view", "customers.manage", "orders.create") }, only: :index
      before_action -> { require_permission!("customers.manage") }, except: :index

      def index
        counts = Customer.active.group(:group_id).count
        render json: { data: CustomerGroup.active.order(:name).map { |g| CustomerSerializers.group(g, count: counts[g.id] || 0) } }
      end

      def create
        g = CustomerGroup.create!(params.permit(:name, :discount_percent))
        render json: CustomerSerializers.group(g, count: 0), status: :created
      end

      def update
        g = CustomerGroup.active.find(params[:id])
        g.update!(params.permit(:name, :discount_percent))
        render json: CustomerSerializers.group(g)
      end

      def destroy
        g = CustomerGroup.active.find(params[:id])
        Customer.where(group_id: g.id).update_all(group_id: nil)
        g.update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end

module Api
  module V1
    # Packaging deducted per order type (a box per takeaway order, a bag per delivery).
    class PackagingRulesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.actions", "settings.manage") }, except: :index

      def index
        require_permission!("stock.view", "stock.actions", "settings.manage")
        render json: { data: PackagingRule.includes(stock_item: :base_unit).order(:order_type).map { |r| RecipeSerializers.packaging_rule(r) } }
      end

      def create
        r = PackagingRule.create!(params.permit(:branch_id, :order_type, :stock_item_id, :quantity))
        render json: RecipeSerializers.packaging_rule(r), status: :created
      end

      def update
        r = PackagingRule.find(params[:id])
        r.update!(params.permit(:branch_id, :order_type, :stock_item_id, :quantity))
        render json: RecipeSerializers.packaging_rule(r)
      end

      def destroy
        PackagingRule.find(params[:id]).destroy!
        head :no_content
      end
    end
  end
end

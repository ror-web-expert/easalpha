module Api
  module V1
    class StockSectionsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.actions", "settings.manage") }, except: :index

      def index
        require_permission!("stock.view", "stock.actions", "stock.waste", "stock.count")
        scope = StockSection.active.order(:sort_order, :name)
        scope = scope.where(branch_id: params[:branch_id].presence || current_branch.id) unless params[:all_branches] == "true"
        StockSection.default_for(current_branch) if scope.empty?
        render json: { data: scope.reload.map { |s| StockSerializers.section(s) } }
      end

      def create
        s = StockSection.create!(params.permit(:name, :sort_order, :is_default).merge(branch: Branch.active.find(params[:branch_id].presence || current_branch.id)))
        render json: StockSerializers.section(s), status: :created
      end

      def update
        s = StockSection.active.find(params[:id])
        s.update!(params.permit(:name, :sort_order, :is_default))
        render json: StockSerializers.section(s)
      end

      def destroy
        s = StockSection.active.find(params[:id])
        raise Api::Errors::Conflict.new("stock.section_has_stock", "Move or count the stock out of this section first") if StockLevel.where(stock_section_id: s.id).where.not(quantity: 0).exists?
        s.update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end

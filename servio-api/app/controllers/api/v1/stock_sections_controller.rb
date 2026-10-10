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
        s = StockSection.create!(params.permit(:name, :slug, :sort_order, :is_default, :cogs_primary).merge(branch: Branch.active.find(params[:branch_id].presence || current_branch.id)))
        StockSection.where(branch_id: s.branch_id).where.not(id: s.id).update_all(cogs_primary: false) if s.cogs_primary
        render json: StockSerializers.section(s), status: :created
      end

      def update
        s = StockSection.active.find(params[:id])
        s.update!(params.permit(:name, :slug, :sort_order, :is_default, :cogs_primary))
        StockSection.where(branch_id: s.branch_id).where.not(id: s.id).update_all(cogs_primary: false) if s.cogs_primary
        render json: StockSerializers.section(s)
      end

      def destroy
        s = StockSection.active.find(params[:id])
        raise Api::Errors::Conflict.new("stock.section_system", "#{s.name} is a system section and cannot be removed") if s.is_system
        raise Api::Errors::Conflict.new("stock.section_has_stock", "Move or count the stock out of this section first") if StockLevel.where(stock_section_id: s.id).where.not(quantity: 0).exists?
        s.update!(archived_at: Time.current)
        head :no_content
      end
    end
  end
end

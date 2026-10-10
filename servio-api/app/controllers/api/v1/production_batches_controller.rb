module Api
  module V1
    class ProductionBatchesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.view", "stock.actions") }, only: :index
      before_action -> { require_permission!("stock.actions") }, only: :create
      before_action :read_only_guard!, only: :create

      def index
        scope = ProductionBatch.includes(:recipe, :stock_document).where(branch_id: current_branch.id).order(produced_at: :desc)
        scope = scope.where(recipe_id: params[:recipe_id]) if params[:recipe_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |b| RecipeSerializers.batch(b) }
      end

      # POST /production_batches { recipe_id, quantity, section_id?, note? }
      def create
        recipe = Recipe.active.includes(lines: :stock_item).find(params.require(:recipe_id))
        section = params[:section_id].present? ? StockSection.active.find(params[:section_id]) : StockSection.default_for(current_branch)
        batch = Stock::Production.run!(recipe: recipe, quantity: params.require(:quantity), section: section, actor: current_membership, branch: current_branch, note: params[:note])
        render json: RecipeSerializers.batch(batch), status: :created
      end
    end
  end
end

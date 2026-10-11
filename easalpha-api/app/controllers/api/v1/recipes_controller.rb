module Api
  module V1
    # Recipes per product or variant, and sub-recipes that produce a stock item.
    class RecipesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.view", "stock.actions", "menu.edit", "menu.view") }, only: %i[index show coverage flags food_cost]
      before_action -> { require_permission!("stock.actions", "menu.edit") }, except: %i[index show coverage flags food_cost]
      before_action :read_only_guard!, except: %i[index show coverage flags food_cost]

      # GET /recipes?product_id=&sub_recipes=true&q=
      def index
        scope = Recipe.active.includes(:product, :variant, :yield_unit, :output_stock_item, lines: %i[stock_item unit]).order(:name)
        scope = scope.where(product_id: params[:product_id]) if params[:product_id].present?
        scope = scope.sub_recipes if params[:sub_recipes] == "true"
        scope = scope.for_products if params[:products] == "true"
        scope = scope.where("recipes.name ILIKE ?", "%#{params[:q]}%") if params[:q].present?
        render json: { data: scope.map { |r| RecipeSerializers.recipe(r) } }
      end

      def show
        render json: RecipeSerializers.recipe(Recipe.includes(lines: %i[stock_item unit]).find(params[:id]), full: true)
      end

      # POST /recipes { product_id | output_stock_item_id, variant_id, name, yield_qty, yield_unit_id, source_section_id, notes, lines: [{stock_item_id, unit_id, quantity, waste_percent}] }
      def create
        r = Recipe.transaction do
          rec = Recipe.create!(recipe_params)
          replace_lines!(rec, lines_param)
          rec
        end
        audit!("create", record: r, after: { name: r.name, cost_minor: r.cost_minor })
        render json: RecipeSerializers.recipe(r.reload, full: true), status: :created
      end

      def update
        r = Recipe.active.find(params[:id])
        Recipe.transaction do
          r.update!(recipe_params.except(:product_id, :output_stock_item_id))
          replace_lines!(r, lines_param) if params.key?(:lines)
        end
        audit!("update", record: r, after: { name: r.name, cost_minor: r.cost_minor })
        render json: RecipeSerializers.recipe(r.reload, full: true)
      end

      def destroy
        r = Recipe.active.find(params[:id])
        r.update!(archived_at: Time.current)
        head :no_content
      end

      def recost
        Recipes::Costing.recompute_all!
        render json: { ok: true }
      end

      def coverage = render(json: Recipes::Costing.coverage)
      def flags = render(json: { data: Recipes::Costing.flags })

      # GET /recipes/food_cost  every product recipe with cost, price before tax and percent against the target
      def food_cost
        rows = Recipe.active.for_products.includes(:product, :variant, product: :tax_rate).map do |r|
          fc = Recipes::Costing.food_cost(r)
          { recipe_id: r.id, product_id: r.product_id, variant_id: r.variant_id, name: r.name, product: r.product.name, variant: r.variant&.name }.merge(fc)
        end.sort_by { |x| -(x[:percent] || 0) }
        render json: { target_percent: InventorySetting.current.food_cost_target_percent.to_f, over_target: rows.count { |x| x[:over_target] }, data: rows }
      end

      private

      def recipe_params
        params.permit(:product_id, :variant_id, :output_stock_item_id, :name, :yield_qty, :yield_unit_id, :source_section_id, :notes)
      end

      def lines_param
        Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
      end

      def replace_lines!(recipe, lines)
        recipe.lines.destroy_all
        lines.each_with_index do |l, i|
          item = StockItem.active.find(l[:stock_item_id])
          unit = l[:unit_id].present? ? Unit.find(l[:unit_id]) : item.base_unit
          recipe.lines.create!(stock_item: item, unit: unit, quantity: l[:quantity], waste_percent: l[:waste_percent].presence || 0, sort_order: i)
        end
        Recipes::Costing.recompute!(recipe.reload)
      end
    end
  end
end

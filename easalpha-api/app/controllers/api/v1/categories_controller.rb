module Api
  module V1
    class CategoriesController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index]
      before_action -> { require_permission!("menu.edit") }, except: %i[index]
      before_action :read_only_guard!, except: %i[index]

      def index
        scope = Category.active.order(:sort_order)
        scope = scope.where(menu_id: params[:menu_id]) if params[:menu_id].present?
        counts = Product.active.group(:category_id).count
        render json: { data: scope.map { |c| MenuSerializers.category(c, product_count: counts[c.id] || 0) } }
      end

      def create
        menu = Menu.active.find(params.require(:menu_id))
        c = Category.create!(category_params.merge(menu: menu))
        audit!("create", record: c, after: MenuSerializers.category(c))
        render json: MenuSerializers.category(c, product_count: 0), status: :created
      end

      def update
        c = Category.active.find(params[:id])
        before = MenuSerializers.category(c)
        c.update!(category_params)
        audit!("update", record: c, before: before, after: MenuSerializers.category(c))
        render json: MenuSerializers.category(c)
      end

      def destroy
        c = Category.active.find(params[:id])
        raise Api::Errors::Conflict.new("category.has_products", "Move or archive its #{c.products.size} products first") if c.products.any?
        c.update!(archived_at: Time.current)
        head :no_content
      end

      def reorder
        Array(params.require(:ids)).each_with_index { |id, i| Category.active.where(id: id).update_all(sort_order: i) }
        index
      end

      private

      def category_params = params.permit(:name, :name_ur, :subtitle, :image_key, :show_online, :station_id, :sort_order)
    end
  end
end

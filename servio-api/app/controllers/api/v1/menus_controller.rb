module Api
  module V1
    class MenusController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index show]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        counts = Category.active.group(:menu_id).count
        render json: { data: Menu.active.order(:sort_order, :created_at).map { |m| MenuSerializers.menu(m, category_count: counts[m.id] || 0) } }
      end

      def show
        m = Menu.active.find(params[:id])
        render json: MenuSerializers.menu(m).merge(categories: m.categories.map { |c| MenuSerializers.category(c, product_count: c.products.size) })
      end

      def create
        m = Menu.create!(menu_params.merge(sort_order: Menu.active.count))
        audit!("create", record: m, after: MenuSerializers.menu(m))
        SetupChecklistItem.complete!("menu")
        render json: MenuSerializers.menu(m), status: :created
      end

      def update
        m = Menu.active.find(params[:id])
        before = MenuSerializers.menu(m)
        m.update!(menu_params)
        audit!("update", record: m, before: before, after: MenuSerializers.menu(m))
        render json: MenuSerializers.menu(m)
      end

      def destroy
        m = Menu.active.find(params[:id])
        raise Api::Errors::Conflict.new("menu.last", "A business needs at least one menu") if Menu.active.count <= 1
        m.update!(archived_at: Time.current)
        head :no_content
      end

      def reorder
        Array(params.require(:ids)).each_with_index { |id, i| Menu.active.where(id: id).update_all(sort_order: i) }
        index
      end

      private

      def menu_params = params.permit(:name, :show_online, :is_default, time_rules: {})
    end
  end
end

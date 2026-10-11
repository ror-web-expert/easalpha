module Api
  module V1
    class ModifierGroupsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index show]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        render json: { data: ModifierGroup.active.includes(:modifiers).order(:sort_order, :name).map { |g| MenuSerializers.modifier_group(g) } }
      end

      def show
        render json: MenuSerializers.modifier_group(ModifierGroup.active.includes(:modifiers).find(params[:id]))
      end

      def create
        g = nil
        ModifierGroup.transaction do
          g = ModifierGroup.create!(group_params)
          sync_modifiers!(g)
        end
        audit!("create", record: g, after: MenuSerializers.modifier_group(g.reload))
        render json: MenuSerializers.modifier_group(g), status: :created
      end

      def update
        g = ModifierGroup.active.find(params[:id])
        ModifierGroup.transaction do
          g.update!(group_params)
          sync_modifiers!(g)
        end
        audit!("update", record: g, after: MenuSerializers.modifier_group(g.reload))
        render json: MenuSerializers.modifier_group(g)
      end

      def destroy
        g = ModifierGroup.active.find(params[:id])
        g.update!(archived_at: Time.current)
        g.product_modifier_groups.delete_all
        head :no_content
      end

      private

      def group_params = params.permit(:name, :min_select, :max_select, :required, :sort_order)

      def sync_modifiers!(group)
        return unless params[:modifiers].is_a?(Array)
        keep = []
        params[:modifiers].each_with_index do |m, i|
          attrs = { name: m[:name], name_ur: m[:name_ur], price_minor: m[:price_minor].to_i, stock_item_id: m[:stock_item_id].presence, quantity: m[:quantity].presence, stock_unit_id: m[:stock_unit_id].presence, sort_order: i, active: true }
          row = m[:id].present? ? Modifier.find_by!(id: m[:id], modifier_group_id: group.id).tap { |r| r.update!(attrs) } : Modifier.create!(attrs.merge(modifier_group: group))
          keep << row.id
        end
        Modifier.where(modifier_group_id: group.id).where.not(id: keep).update_all(active: false)
      end
    end
  end
end

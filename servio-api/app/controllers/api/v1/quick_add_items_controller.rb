module Api
  module V1
    # SPEC Quick Add Menu: items picked from the full product list into a short pinned list.
    class QuickAddItemsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit", "orders.create") }, only: :index
      before_action -> { require_permission!("menu.edit") }, only: :replace

      def index
        render json: { data: QuickAddItem.ordered.includes(:product, :variant).map { |q| MenuSerializers.quick_add_item(q) } }
      end

      # PUT /quick_add_items  items: [{product_id, variant_id?}] in order
      def replace
        read_only_guard!
        rows = Array(params.require(:items)).map { |r| r.permit(:product_id, :variant_id).to_h }
        rows.each { |r| Product.where(archived_at: nil).find(r[:product_id]) }
        QuickAddItem.replace!(rows)
        audit!("bulk_update", table_name: "quick_add_items", after: { count: rows.size })
        index
      end
    end
  end
end

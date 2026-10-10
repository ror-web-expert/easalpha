module Api
  module V1
    class ProductsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index show]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        scope = Product.where(archived_at: nil).includes(:variants, :product_prices, :product_modifier_groups).order(:sort_order, :name)
        scope = scope.where(category_id: params[:category_id]) if params[:category_id].present?
        scope = scope.where(is_favourite: true) if params[:favourites] == "true"
        scope = scope.where(active: true) unless params[:include_inactive] == "true"
        scope = scope.where("products.name ILIKE :q OR products.sku ILIKE :q OR products.name_ur ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |p| MenuSerializers.product(p, full: true) }
      end

      def show
        render json: MenuSerializers.product(Product.includes(:variants, :product_prices, :product_modifier_groups).find(params[:id]), full: true)
      end

      def create
        product = nil
        Product.transaction do
          category = Category.active.find(params.require(:category_id))
          product = Product.create!(product_params.merge(category: category, sort_order: params[:sort_order].presence || category.products.count))
          apply_nested!(product)
        end
        audit!("create", record: product, after: MenuSerializers.product(product))
        SetupChecklistItem.complete!("menu")
        render json: MenuSerializers.product(product.reload, full: true), status: :created
      end

      def update
        product = Product.find(params[:id])
        before = MenuSerializers.product(product, full: true)
        Product.transaction do
          product.update!(product_params)
          product.update!(category: Category.active.find(params[:category_id])) if params[:category_id].present?
          apply_nested!(product)
        end
        after = MenuSerializers.product(product.reload, full: true)
        action = before[:base_price_minor] != after[:base_price_minor] || before[:prices] != after[:prices] ? "price_change" : "update"
        audit!(action, record: product, before: before, after: after)
        render json: after
      end

      def destroy
        product = Product.find(params[:id])
        product.update!(archived_at: Time.current, active: false)
        audit!("update", record: product, after: { archived_at: product.archived_at })
        head :no_content
      end

      def reorder
        Array(params.require(:ids)).each_with_index { |id, i| Product.where(id: id).update_all(sort_order: i) }
        head :no_content
      end

      # GET /products/:id/consumables  SPEC Order Inventory tab
      def consumables
        product = Product.find(params[:id])
        render json: { data: product.order_type_consumables.includes(:stock_item, :unit, :variant).order(:order_type).map { |c| MenuSerializers.consumable(c) } }
      end

      # PUT /products/:id/consumables  rows: [{variant_id, order_type, stock_item_id, quantity, unit_id}], copy_all_order_types
      def set_consumables
        product = Product.find(params[:id])
        rows = Array(params[:rows]).map { |r| r.permit(:variant_id, :order_type, :stock_item_id, :quantity, :unit_id).to_h }
        OrderTypeConsumable.replace!(product, rows, copy_all_order_types: ActiveModel::Type::Boolean.new.cast(params[:copy_all_order_types]))
        audit!("update", record: product, after: { consumables: rows.size })
        consumables
      end

      # GET /products/codes  SPEC Product Codes panel: every product with its SKU and PCT code
      def codes
        rows = Product.where(archived_at: nil).includes(:category).order(:name).map { |p| { id: p.id, name: p.name, category: p.category.name, sku: p.sku, pct_code: p.pct_code } }
        render json: { data: rows }
      end

      # PUT /products/codes  rows: [{id, sku, pct_code}]
      def set_codes
        rows = Array(params.require(:rows))
        Product.transaction { rows.each { |r| Product.find(r[:id]).update!(sku: r[:sku].presence, pct_code: r[:pct_code].presence) } }
        audit!("bulk_update", table_name: "products", after: { codes_updated: rows.size })
        codes
      end

      def favourite
        product = Product.find(params[:id])
        product.update!(is_favourite: ActiveModel::Type::Boolean.new.cast(params[:value]))
        render json: MenuSerializers.product(product)
      end

      private

      def product_params
        params.permit(:name, :name_ur, :description, :sku, :image_key, :base_price_minor, :tax_rate_id, :is_favourite, :show_online, :active,
                      :sold_by_weight, :weight_unit, :station_id, :discount_value, :discount_type, :pct_code, allergens: [], dietary_tags: [])
      end

      # variants: [{id?, name, price_minor, sku}], prices: [{variant_id?, branch_id?, order_type, price_minor}], modifier_group_ids: [...]
      def apply_nested!(product)
        if params[:variants].is_a?(Array)
          keep = []
          params[:variants].each_with_index do |v, i|
            attrs = { name: v[:name], price_minor: v[:price_minor].to_i, sku: v[:sku].presence, sort_order: i }
            row = v[:id].present? ? product.variants.find(v[:id]).tap { |r| r.update!(attrs) } : product.variants.create!(attrs)
            keep << row.id
          end
          product.variants.where.not(id: keep).update_all(archived_at: Time.current)
        end
        if params[:prices].is_a?(Array)
          product.product_prices.delete_all
          params[:prices].each do |pr|
            product.product_prices.create!(variant_id: pr[:variant_id].presence, branch_id: pr[:branch_id].presence, order_type: pr[:order_type], price_minor: pr[:price_minor].to_i)
          end
        end
        if params[:modifier_group_ids].is_a?(Array)
          product.product_modifier_groups.delete_all
          params[:modifier_group_ids].each_with_index do |gid, i|
            product.product_modifier_groups.create!(modifier_group: ModifierGroup.active.find(gid), sort_order: i)
          end
        end
      end
    end
  end
end

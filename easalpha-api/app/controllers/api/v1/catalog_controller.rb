module Api
  module V1
    # One call gives a till everything it needs to sell: menus, products, modifiers, deals, promotions, tax, stations.
    # ?since=<iso time> returns only what changed, for incremental sync.
    class CatalogController < BaseController
      before_action :require_catalog_access!

      def show
        since = params[:since].present? ? Time.iso8601(params[:since]) : nil
        branch_id = current_branch&.id
        products = Product.where(archived_at: nil).includes(:variants, :product_prices, :product_modifier_groups)
        products = products.where("products.updated_at > ?", since) if since
        render json: {
          generated_at: Time.current,
          business: { id: current_business.id, name: current_business.name, currency: current_business.currency, time_zone: current_business.time_zone,
                      phone: current_business.phone, logo_key: current_business.logo_key, settings: current_business.settings },
          branch: current_branch && Serializers.branch(current_branch),
          tax_rates: TaxRate.active.map { |t| MenuSerializers.tax_rate(t) },
          stations: (branch_id ? Station.active.where(branch_id: branch_id) : Station.active).map { |s| MenuSerializers.station(s) },
          menus: Menu.active.order(:sort_order).map { |m| MenuSerializers.menu(m).merge(available_now: m.available_at?(Time.current, zone: current_business.time_zone)) },
          categories: Category.active.order(:sort_order).map { |c| MenuSerializers.category(c) },
          products: products.map { |p| MenuSerializers.product(p, full: true) },
          modifier_groups: ModifierGroup.active.includes(:modifiers).map { |g| MenuSerializers.modifier_group(g) },
          deals: Deal.active.includes(:deal_items).map { |d| MenuSerializers.deal(d) },
          promotions: Promotion.active.map { |p| MenuSerializers.promotion(p) },
          quick_add_items: QuickAddItem.ordered.includes(:product, :variant).map { |q| MenuSerializers.quick_add_item(q) },
          since: since
        }
      end

      private

      def require_catalog_access!
        return if current_device&.paired?
        authenticate!
      end
    end
  end
end

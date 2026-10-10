module Api
  module V1
    # Public, unauthenticated storefront driven by Website Config: identity, pages, the online menu and reviews.
    class StorefrontController < ActionController::API
      rescue_from ActiveRecord::RecordNotFound do
        render json: { error: { code: "not_found", message: "Not found" } }, status: :not_found
      end

      # GET /public/storefront/:slug
      def show
        cfg = Tenancy::Context.unscoped { WebsiteConfig.find_by!(slug: params[:slug], published: true) }
        business = Business.find(cfg.business_id)
        Tenancy::Context.with(business) do
          branch = Branch.active.order(is_main: :desc).first
          menus = Menu.active.where(show_online: true).order(:sort_order).select { |m| m.available_at?(Time.current, zone: business.time_zone) }
          categories = Category.active.where(show_online: true).order(:sort_order).to_a
          products = Product.active.where(show_online: true).order(:sort_order).includes(:variants, :category).to_a
          reviews = Review.rated.order(created_at: :desc).limit(10)
          render json: { business: { name: business.name, slug: business.slug, currency: business.currency, logo_key: business.logo_key, phone: business.phone },
                         branch: branch && { id: branch.id, name: branch.name, address: branch.respond_to?(:address) ? branch.address : nil, hours: branch.business_day_window },
                         config: cfg.sections, menus: menus.map { |m| { id: m.id, name: m.name } },
                         categories: categories.map { |c| { id: c.id, name: c.name, subtitle: c.respond_to?(:subtitle) ? c.subtitle : nil, menu_id: c.respond_to?(:menu_id) ? c.menu_id : nil } },
                         products: products.map { |p| { id: p.id, name: p.name, description: p.description, category_id: p.category_id, price_minor: p.base_price_minor, image_key: p.image_key,
                                                        variants: p.variants.map { |v| { id: v.id, name: v.name, price_minor: v.price_minor } } } },
                         reviews: { summary: Reviews.summary(Review.all), recent: reviews.map { |r| { rating: r.rating, rating_word: r.rating_word, comment: r.comment, order_type: r.order_type, at: r.created_at } } } }
        end
      end

      # POST /public/storefront/:slug/reviews { rating, comment, order_label? }  (SPEC: reviews come in from the website)
      def create_review
        cfg = Tenancy::Context.unscoped { WebsiteConfig.find_by!(slug: params[:slug], published: true) }
        business = Business.find(cfg.business_id)
        Tenancy::Context.with(business) do
          order = params[:order_label].present? ? Order.find_by(serial: params[:order_label].to_s.delete("#")) : nil
          r = Reviews.create!({ rating: params[:rating], comment: params[:comment].to_s[0, 1000], source: "website" }, order: order)
          render json: { id: r.id, rating: r.rating, rating_word: r.rating_word }, status: :created
        end
      end
    end
  end
end

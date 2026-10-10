module Api
  module V1
    # SPEC Reviews: from the tablet and the website, tied to an order; filters by rating, source, type and Pending.
    class ReviewsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("settings.manage", "reports.view_all", "customers.view", "orders.create") }, only: %i[index summary]
      before_action -> { require_permission!("orders.create", "settings.manage", "app.pos") }, only: %i[create rate]
      before_action :read_only_guard!, only: %i[create rate destroy]

      # GET /reviews?rating=&source=&order_type=&pending=true&from=&to=
      def index
        rows, cursor = paginate(filtered.includes(:order, :customer).order(created_at: :desc))
        render json: { data: rows.map { |r| MarketingSerializers.review(r) }, next_cursor: cursor, summary: Reviews.summary(filtered) }
      end

      def summary = render(json: Reviews.summary(filtered))

      # POST /reviews { order_id | order_label, rating?, comment, source: tablet|website|pos|qr }
      def create
        order = params[:order_id].present? ? Order.find(params[:order_id]) : (params[:order_label].present? ? Order.find_by!(serial: params[:order_label].to_s.delete("#")) : nil)
        r = Reviews.create!(params.permit(:customer_id, :rating, :comment, :source, :order_type, :order_total_minor).to_h.symbolize_keys, order: order)
        render json: MarketingSerializers.review(r), status: :created
      end

      # PATCH /reviews/:id { rating, comment }  a Pending review gets its rating
      def rate
        r = Reviews.rate!(Review.find(params[:id]), rating: params.require(:rating), comment: params[:comment])
        render json: MarketingSerializers.review(r)
      end

      def destroy
        require_permission!("settings.manage")
        Review.find(params[:id]).destroy!
        head :no_content
      end

      private

      def filtered
        scope = Review.all
        scope = scope.where(rating: params[:rating]) if params[:rating].present?
        scope = scope.where(source: params[:source]) if params[:source].present?
        scope = scope.where(order_type: params[:order_type]) if params[:order_type].present?
        scope = scope.pending if params[:pending] == "true"
        scope = scope.rated if params[:pending] == "false"
        scope = scope.where(created_at: Date.parse(params[:from]).beginning_of_day..) if params[:from].present?
        scope = scope.where(created_at: ..Date.parse(params[:to]).end_of_day) if params[:to].present?
        scope
      end
    end
  end
end

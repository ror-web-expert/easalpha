module Api
  module V1
    class PromotionsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit", "orders.create") }, only: %i[index show check]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show check]
      before_action :read_only_guard!, except: %i[index show check]

      def index
        render json: { data: Promotion.where(archived_at: nil).order(:created_at).map { |p| MenuSerializers.promotion(p) } }
      end

      def show
        render json: MenuSerializers.promotion(Promotion.find(params[:id]))
      end

      def create
        p = Promotion.create!(promotion_params)
        audit!("create", record: p, after: MenuSerializers.promotion(p))
        render json: MenuSerializers.promotion(p), status: :created
      end

      def update
        p = Promotion.find(params[:id])
        before = MenuSerializers.promotion(p)
        p.update!(promotion_params)
        audit!("update", record: p, before: before, after: MenuSerializers.promotion(p))
        render json: MenuSerializers.promotion(p)
      end

      def destroy
        Promotion.find(params[:id]).update!(archived_at: Time.current, active: false)
        head :no_content
      end

      # GET /promotions/check?coupon_code=X&amount_minor=1000
      def check
        p = Promotion.active.find_by(coupon_code: params[:coupon_code].to_s.strip.upcase)
        raise Api::Errors::NotFound.new("coupon.invalid", "This coupon does not exist") unless p
        raise Api::Errors::Conflict.new("coupon.unavailable", p.sold_out? ? "This offer is sold out" : "This coupon is not valid right now") unless p.available_at?(Time.current, zone: current_business.time_zone)
        amount = params[:amount_minor].to_i
        render json: MenuSerializers.promotion(p).merge(discount_minor: p.discount_for(amount))
      end

      private

      def promotion_params
        params.permit(:name, :kind, :value, :coupon_code, :applies_to, :start_time, :end_time, :valid_from, :valid_to, :unit_limit, :active, :min_order_minor, target_ids: [], days: [])
      end
    end
  end
end

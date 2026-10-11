module Api
  module V1
    # SPEC: regular discount tiers, voucher batches and codes, loyalty redemption options.
    class MarketingController < BaseController
      before_action :authenticate!
      READS = %i[tiers batches batch vouchers redemption_options].freeze
      before_action -> { require_permission!("settings.manage", "menu.edit", "orders.create", "reports.view_all", "MARKETING") }, only: READS
      before_action -> { require_permission!("settings.manage", "MARKETING") }, except: READS + %i[redeem_option]
      before_action :read_only_guard!, except: READS

      # Regular discounts
      def tiers = render(json: { data: RegularDiscountTier.active.order(:within_days).map { |t| MarketingSerializers.tier(t) }, enabled: Marketing::RegularDiscounts.enabled?, blocked_customer_ids: Marketing::RegularDiscounts.blocked_ids })
      def create_tier
        t = RegularDiscountTier.create!(tier_params)
        audit!("create", record: t, after: MarketingSerializers.tier(t))
        render json: MarketingSerializers.tier(t), status: :created
      end
      def update_tier
        t = RegularDiscountTier.active.find(params[:id])
        t.update!(tier_params)
        render json: MarketingSerializers.tier(t)
      end
      def destroy_tier
        RegularDiscountTier.active.find(params[:id]).update!(archived_at: Time.current, active: false)
        head :no_content
      end

      # Vouchers
      def batches
        scope = VoucherBatch.where(archived_at: nil).order(created_at: :desc)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        render json: { data: scope.map { |b| MarketingSerializers.batch(b) } }
      end
      def batch = render(json: MarketingSerializers.batch(VoucherBatch.find(params[:id])).merge(vouchers: Voucher.where(voucher_batch_id: params[:id]).includes(:voucher_batch, :customer).order(created_at: :desc).limit(500).map { |v| MarketingSerializers.voucher(v) }))
      def create_batch
        b = Marketing::Vouchers.create_batch!(batch_params, actor: current_membership)
        audit!("create", record: b, after: MarketingSerializers.batch(b))
        render json: MarketingSerializers.batch(b), status: :created
      end
      def update_batch
        b = VoucherBatch.find(params[:id])
        b.update!(params.permit(:name, :expires_on, :usage_limit, :active, :min_spend_minor))
        render json: MarketingSerializers.batch(b)
      end
      def destroy_batch
        VoucherBatch.find(params[:id]).update!(archived_at: Time.current, active: false)
        head :no_content
      end
      # POST /voucher_batches/:id/issue { customer_ids: [], send: true }  personal codes, sent from the POS campaign screen
      def issue
        require_permission!("settings.manage", "MARKETING", "MARKETING_CAMPAIGN", "orders.create")
        b = VoucherBatch.active.find(params[:id])
        issued = Marketing::Vouchers.issue!(b, customer_ids: Array(params[:customer_ids]), send: params[:send].nil? || ActiveModel::Type::Boolean.new.cast(params[:send]), actor: current_membership)
        render json: { issued: issued.size, data: issued.map { |v| MarketingSerializers.voucher(v) }, batch: MarketingSerializers.batch(b.reload) }, status: :created
      end
      # GET /vouchers?code=&customer_id=&status=
      def vouchers
        scope = Voucher.includes(:voucher_batch, :customer).order(created_at: :desc)
        scope = scope.where(code: params[:code].to_s.strip.upcase) if params[:code].present?
        scope = scope.where(customer_id: params[:customer_id]) if params[:customer_id].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |v| MarketingSerializers.voucher(v) }
      end

      # Loyalty redemption options
      def redemption_options = render(json: { data: LoyaltyRedemptionOption.active.includes(:product).map { |o| MarketingSerializers.redemption_option(o) } })
      def create_option
        o = LoyaltyRedemptionOption.create!(params.permit(:name, :points, :kind, :value, :product_id, :active, :sort_order))
        render json: MarketingSerializers.redemption_option(o), status: :created
      end
      def update_option
        o = LoyaltyRedemptionOption.active.find(params[:id])
        o.update!(params.permit(:name, :points, :kind, :value, :product_id, :active, :sort_order))
        render json: MarketingSerializers.redemption_option(o)
      end
      def destroy_option
        LoyaltyRedemptionOption.active.find(params[:id]).update!(archived_at: Time.current, active: false)
        head :no_content
      end
      # POST /orders/:id/redeem_option { option_id }
      def redeem_option
        require_permission!("orders.create")
        order = Order.includes(items: :modifiers).find(params[:id])
        Loyalty.redeem_option!(order, option: LoyaltyRedemptionOption.find(params.require(:option_id)), actor: current_membership)
        render json: OrderSerializers.full(order.reload)
      end

      private

      def tier_params = params.permit(:name, :within_days, :kind, :value, :min_order_minor, :active, excluded_product_ids: [], excluded_category_ids: [], excluded_order_types: [])
      def batch_params = params.permit(:name, :kind, :value_kind, :value, :min_spend_minor, :expires_on, :usage_limit, :public_code).to_h.symbolize_keys
    end
  end
end

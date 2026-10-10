module Api
  module V1
    class DealsController < BaseController
      before_action -> { require_permission!("menu.view", "menu.edit") }, only: %i[index show]
      before_action -> { require_permission!("menu.edit") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        scope = Deal.where(archived_at: nil).includes(:deal_items).order(:sort_order, :name)
        scope = scope.where(active: true) if params[:active] == "true"
        render json: { data: scope.map { |d| MenuSerializers.deal(d) } }
      end

      def show
        render json: MenuSerializers.deal(Deal.includes(:deal_items).find(params[:id]))
      end

      def create
        d = nil
        Deal.transaction do
          d = Deal.create!(deal_params)
          sync_items!(d)
        end
        audit!("create", record: d, after: MenuSerializers.deal(d.reload))
        render json: MenuSerializers.deal(d), status: :created
      end

      def update
        d = Deal.find(params[:id])
        before = MenuSerializers.deal(d)
        Deal.transaction do
          d.update!(deal_params)
          sync_items!(d)
        end
        audit!(before[:price_minor] != d.price_minor ? "price_change" : "update", record: d, before: before, after: MenuSerializers.deal(d.reload))
        render json: MenuSerializers.deal(d)
      end

      def destroy
        d = Deal.find(params[:id])
        d.update!(archived_at: Time.current, active: false)
        head :no_content
      end

      private

      def deal_params = params.permit(:name, :description, :image_key, :price_minor, :active, :show_online, :valid_from, :valid_to, :tax_rate_id, :sort_order)

      def sync_items!(deal)
        return unless params[:items].is_a?(Array)
        raise Api::Errors::Unprocessable.new("deal.no_items", "A deal needs at least one product") if params[:items].empty?
        deal.deal_items.delete_all
        params[:items].each do |i|
          product = Product.find(i[:product_id])
          deal.deal_items.create!(product: product, variant_id: i[:variant_id].presence, quantity: (i[:quantity].presence || 1).to_i, choice_group: i[:choice_group].presence)
        end
      end
    end
  end
end

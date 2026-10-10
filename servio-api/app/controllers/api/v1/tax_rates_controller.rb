module Api
  module V1
    class TaxRatesController < BaseController
      before_action :authenticate!, only: :index
      before_action -> { require_permission!("settings.manage") }, except: :index
      before_action :read_only_guard!, except: :index

      def index
        render json: { data: TaxRate.order(:created_at).map { |t| MenuSerializers.tax_rate(t) } }
      end

      def create
        t = TaxRate.create!(tax_params)
        audit!("settings_change", record: t, after: MenuSerializers.tax_rate(t))
        SetupChecklistItem.complete!("tax")
        render json: MenuSerializers.tax_rate(t), status: :created
      end

      def update
        t = TaxRate.find(params[:id])
        before = MenuSerializers.tax_rate(t)
        t.update!(tax_params)
        audit!("settings_change", record: t, before: before, after: MenuSerializers.tax_rate(t))
        render json: MenuSerializers.tax_rate(t)
      end

      def destroy
        t = TaxRate.find(params[:id])
        raise Api::Errors::Conflict.new("tax_rate.in_use", "Products still use this tax rate") if Product.where(tax_rate_id: t.id, archived_at: nil).exists?
        t.update!(active: false)
        head :no_content
      end

      private

      def tax_params = params.permit(:name, :rate, :inclusive, :authority, :active, :is_default)
    end
  end
end

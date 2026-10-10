module Api
  module V1
    class PaymentMethodsController < BaseController
      before_action :authenticate!, only: :index
      before_action -> { require_permission!("settings.manage") }, except: :index

      def index
        render json: { data: PaymentMethod.order(:sort_order).map { |m| PaymentSerializers.payment_method(m) } }
      end

      def create
        m = PaymentMethod.create!(params.permit(:code, :name, :kind, :payment_account_id, :active, :works_offline, :needs_reference, :sort_order))
        SetupChecklistItem.complete!("payment_methods")
        render json: PaymentSerializers.payment_method(m), status: :created
      end

      def update
        m = PaymentMethod.find(params[:id])
        m.update!(params.permit(:name, :payment_account_id, :active, :works_offline, :needs_reference, :sort_order))
        SetupChecklistItem.complete!("payment_methods")
        render json: PaymentSerializers.payment_method(m)
      end
    end
  end
end

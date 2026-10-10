module Api
  module V1
    class BusinessController < BaseController
      before_action :authenticate!

      def show
        render json: Serializers.business(current_business)
      end

      def update
        require_permission!("settings.manage")
        read_only_guard!
        before = current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :settings)
        attrs = params.permit(:name, :legal_name, :phone, :email, :currency, :time_zone, :country, settings: {})
        current_business.update!(attrs)
        audit!("settings_change", record: current_business, before: before, after: current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :settings))
        SetupChecklistItem.complete!("business_info") if current_business.phone.present?
        render json: Serializers.business(current_business)
      end
    end
  end
end

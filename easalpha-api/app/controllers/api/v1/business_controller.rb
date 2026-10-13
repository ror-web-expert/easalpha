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
        before = current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :logo_key, :settings)
        attrs = params.permit(:name, :legal_name, :phone, :email, :currency, :time_zone, :country, :logo_key, settings: {})
        owner_only_modules!(attrs[:settings]) if attrs.key?(:settings)
        current_business.update!(attrs)
        audit!("settings_change", record: current_business, before: for_audit(before), after: for_audit(current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :logo_key, :settings)))
        SetupChecklistItem.complete!("business_info") if current_business.phone.present?
        render json: Serializers.business(current_business)
      end

      private

      # These settings back up the registry, so a modules.* key here switches a module on or off while it has no
      # settings row; only the owner may do that (as in SettingsController#update).
      def owner_only_modules!(settings)
        return if current_membership.owner?
        modules = ->(h) { h.to_h.select { |k, _| k.to_s.start_with?("modules.") } }
        return if modules.call(settings) == modules.call(current_business.settings)
        raise Api::Errors::Forbidden.new("modules.owner_only", "Only the owner can switch modules on or off")
      end

      # Audit rows are permanent, so secrets kept in the settings never go into them.
      def for_audit(fields) = fields.merge("settings" => Setting.without_secrets(fields["settings"].to_h))
    end
  end
end

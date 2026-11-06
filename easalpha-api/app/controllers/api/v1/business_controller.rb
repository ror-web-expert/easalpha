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
        before = current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :country, :logo_key, :settings)
        attrs = params.permit(:name, :legal_name, :phone, :email, :currency, :time_zone, :country, :logo_key, settings: {})
        owner_only_modules!(attrs[:settings]) if attrs.key?(:settings)
        old_zone = current_business.time_zone
        Business.transaction do
          current_business.update!(attrs)
          follow_time_zone!(old_zone) if current_business.saved_change_to_time_zone?
        end
        audit!("settings_change", record: current_business, before: for_audit(before), after: for_audit(current_business.slice(:name, :legal_name, :phone, :email, :currency, :time_zone, :country, :logo_key, :settings)))
        # The item reads "name, logo and phone": the phone alone ticked it (S10). The logo is saved on Branding.
        SetupChecklistItem.complete!("business_info") if current_business.name.present? && current_business.phone.present? && current_business.logo_key.present?
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

      # A branch on the store's old time zone follows it to the new one, so the business day, the receipts and the
      # reports do not stay on the old clock (S3: the store moved to Karachi, the branch stayed on New York). A branch
      # set to a zone of its own keeps it.
      def follow_time_zone!(old_zone)
        Branch.where(time_zone: old_zone).find_each { |b| b.update!(time_zone: current_business.time_zone) }
      end

      # Audit rows are permanent, so secrets kept in the settings never go into them.
      def for_audit(fields) = fields.merge("settings" => Setting.without_secrets(fields["settings"].to_h))
    end
  end
end

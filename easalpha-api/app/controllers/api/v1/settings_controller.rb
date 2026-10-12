module Api
  module V1
    # SPEC settings store: grouped read, patch by key, and a version the POS compares to know when to re-sync.
    class SettingsController < BaseController
      before_action :authenticate!, except: [ :version ]

      # GET /settings  -> { version, groups: { store: { name, screens: { "Store Profile": [ {key, value, ...} ] } } } }
      def show
        values = Setting.effective(current_business)
        groups = Settings::Registry::GROUPS.map do |gkey, gname|
          keys = Settings::Registry::KEYS.values.select { |k| k.group == gkey }
          [ gkey, { name: gname, screens: keys.group_by(&:screen).transform_values { |ks| ks.map { |k| k.to_h(values[k.key]) } } } ]
        end.to_h
        render json: { version: current_business.settings_version, groups: groups }
      end

      # PATCH /settings  { values: { "pos.kds.timeout_minutes": 10, ... } }
      def update
        require_permission!("settings.manage")
        read_only_guard!
        values = params.require(:values).to_unsafe_h
        unknown = values.keys - Settings::Registry.keys
        raise Api::Errors::BadRequest.new("settings.unknown_key", "Unknown settings: #{unknown.join(', ')}") if unknown.any?
        if values.keys.any? { |k| k.start_with?("modules.") } && !current_membership.owner?
          raise Api::Errors::Forbidden.new("modules.owner_only", "Only the owner can switch modules on or off")
        end
        before = Setting.effective(current_business).slice(*values.keys)
        version = Setting.write!(current_business, values, user: current_user)
        after = Setting.effective(current_business).slice(*values.keys)
        audit!("settings_change", record: current_business, before: mask(before), after: mask(after))
        render json: { version: version, values: mask(after), modules: BusinessModules.all(current_business.reload) }
      end

      # GET /settings/version  works with a user token or a paired-device token, so a till can check cheaply.
      def version
        raise Api::Errors::Unauthorized unless current_business
        render json: { version: current_business.settings_version }
      end

      private

      def mask(h)
        h.to_h { |k, v| [ k, Settings::Registry.key(k)&.secret ? (v.present? ? "set" : nil) : v ] }
      end
    end
  end
end

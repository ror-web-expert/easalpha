module Api
  module V1
    module Super
      # Product-owner branding of EasAlpha itself: support contact, hours, powered-by line, announcement.
      class PlatformSettingsController < BaseController
        before_action :authenticate_super!

        def show
          render json: { values: PlatformSetting.all_values, defaults: PlatformSetting::DEFAULTS, admins: SuperAdmin.order(:name).map { |a| { id: a.id, name: a.name, email: a.email, last_login_at: a.last_login_at } } }
        end

        def update
          values = params.require(:values).permit(*PlatformSetting::DEFAULTS.keys).to_h
          render json: { values: PlatformSetting.update_values!(values) }
        end
      end
    end
  end
end

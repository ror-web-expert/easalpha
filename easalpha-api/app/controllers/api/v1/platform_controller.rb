module Api
  module V1
    # GET /platform  public: who to contact for support, hours, the powered-by line and any announcement.
    # Every surface (admin panel, POS, site) reads it so the product owner changes it in one place.
    class PlatformController < BaseController
      def show
        render json: PlatformSetting.all_values.merge(version: EasAlpha::VERSION)
      end
    end
  end
end

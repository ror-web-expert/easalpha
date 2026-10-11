module Api
  module V1
    class HealthController < BaseController
      def show
        ActiveRecord::Base.connection.execute("SELECT 1")
        render json: { status: "ok", time: Time.current, version: EasAlpha::VERSION }
      end
    end
  end
end

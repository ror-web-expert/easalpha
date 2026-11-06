module Api
  module V1
    class HealthController < BaseController
      # rls: whether Row-Level Security binds this process's database role. False while the API connects as the owner
      # (EASALPHA_APP_DB_PASSWORD unset), so the deploy check and an operator see it (docs/DEPLOY.md, "Row-Level
      # Security"). The query also proves the database answers.
      def show
        render json: { status: "ok", time: Time.current, version: EasAlpha::VERSION, rls: EasAlpha::Rls.active? }
      end
    end
  end
end

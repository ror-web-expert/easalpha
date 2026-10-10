module Api
  module V1
    module Super
      class SessionsController < BaseController
        def create
          admin = SuperAdmin.find_by(email: params[:email].to_s.downcase)
          raise Api::Errors::Unauthorized.new("login.invalid", "Email or password is wrong") unless admin&.authenticate(params[:password].to_s)
          admin.update_column(:last_login_at, Time.current)
          render json: { access_token: Auth::TokenService.super_token(admin), admin: { id: admin.id, name: admin.name, email: admin.email } }
        end
      end
    end
  end
end

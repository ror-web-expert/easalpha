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

        def me
          authenticate_super!
          render json: { admin: { id: @super_admin.id, name: @super_admin.name, email: @super_admin.email, last_login_at: @super_admin.last_login_at } }
        end
      end
    end
  end
end

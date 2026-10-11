module Api
  module V1
    class AuthController < BaseController
      # POST /auth/signup  name, business_name, email+password or phone (+otp_code), country, currency, time_zone
      def signup
        phone = User.normalize_phone(params[:phone])
        email = params[:email].to_s.strip.downcase.presence
        raise Api::Errors::BadRequest.new("signup.contact_required", "Email and password, or phone with OTP code, is required") if email.blank? && phone.blank?
        if phone.present? && params[:otp_code].present?
          raise Api::Errors::Unauthorized.new("otp.invalid", "The code is wrong or expired") unless OtpCode.verify!(phone: phone, purpose: "signup", code: params[:otp_code])
        elsif email.present?
          raise Api::Errors::BadRequest.new("signup.password_required", "Password is required with email") if params[:password].blank?
        else
          raise Api::Errors::BadRequest.new("signup.otp_required", "Request an OTP for this phone first")
        end
        raise Api::Errors::Conflict.new("signup.exists", "An account with this email or phone already exists") if (email && User.exists?(email: email)) || (phone && User.exists?(phone: phone))

        result = Auth::Signup.call(name: params.require(:name), business_name: params.require(:business_name), email: email, phone: phone,
                                   password: params[:password], country: params[:country].presence || "PK", currency: params[:currency].presence || "PKR",
                                   time_zone: params[:time_zone].presence || "Asia/Karachi", locale: params[:locale].presence || "en")
        Tenancy::Context.with(result.business, user: result.user) do
          render json: Auth::SessionIssuer.issue(user: result.user, membership: result.membership, app: "admin", request: request), status: :created
        end
      end

      # POST /auth/login  email, password, [business_id]
      def login
        user = User.find_by(email: params[:email].to_s.strip.downcase)
        unless user&.password_digest && user.authenticate(params[:password].to_s)
          AuditLog.record(action: "login", after: { email: params[:email], ok: false }, business: nil)
          raise Api::Errors::Unauthorized.new("login.invalid", "Email or password is wrong")
        end
        issue_for(user, app: params[:app].presence || "admin")
      end

      # POST /auth/otp/request  phone, purpose (login|signup)
      def otp_request
        phone = User.normalize_phone(params[:phone])
        raise Api::Errors::BadRequest.new("otp.phone_invalid", "Phone must be in international format") unless phone&.match?(/\A\+[1-9]\d{7,14}\z/)
        purpose = params[:purpose].presence_in(%w[login signup]) || "login"
        raise Api::Errors::NotFound.new("otp.no_account", "No account with this phone. Sign up first.") if purpose == "login" && !User.exists?(phone: phone)
        _record, code = OtpCode.issue!(phone: phone, purpose: purpose)
        Whatsapp::Sender.send_otp(phone: phone, code: code)
        body = { sent: true, phone: phone, expires_in: OtpCode::TTL.to_i }
        body[:dev_code] = code unless Rails.env.production?
        render json: body
      end

      # POST /auth/otp/verify  phone, code
      def otp_verify
        phone = User.normalize_phone(params[:phone])
        raise Api::Errors::Unauthorized.new("otp.invalid", "The code is wrong or expired") unless OtpCode.verify!(phone: phone, purpose: "login", code: params[:code])
        user = User.find_by!(phone: phone)
        issue_for(user, app: params[:app].presence || "admin")
      end

      # POST /auth/refresh  refresh_token
      def refresh
        rt = RefreshToken.find_valid(params.require(:refresh_token))
        raise Api::Errors::Unauthorized.new("refresh.invalid", "Session expired, log in again") unless rt
        membership = rt.membership
        raise Api::Errors::Unauthorized.new("session.invalid", "Session is no longer valid") unless membership&.active?
        rt.revoke!
        Tenancy::Context.with(membership.business, user: rt.user) do
          render json: Auth::SessionIssuer.issue(user: rt.user, membership: membership, app: rt.app, device: rt.device, request: request)
        end
      end

      # POST /auth/logout  refresh_token
      def logout
        rt = RefreshToken.find_valid(params[:refresh_token].to_s)
        rt&.revoke!
        head :no_content
      end

      # POST /auth/switch  business_id  (requires a valid access token)
      def switch
        authenticate!
        membership = Membership.all_for_user(current_user.id).find { |m| m.business_id == params.require(:business_id) }
        raise Api::Errors::NotFound.new("business.not_member", "You are not a member of that business") unless membership
        Tenancy::Context.with(membership.business, user: current_user) do
          render json: Auth::SessionIssuer.issue(user: current_user, membership: membership, app: @claims[:app] || "admin", request: request)
        end
      end

      private

      def issue_for(user, app:)
        memberships = Membership.all_for_user(user.id)
        raise Api::Errors::Forbidden.new("login.no_business", "This account is not a member of any business") if memberships.empty?
        membership = params[:business_id].present? ? memberships.find { |m| m.business_id == params[:business_id] } : memberships.max_by(&:updated_at)
        raise Api::Errors::NotFound.new("business.not_member", "You are not a member of that business") unless membership
        raise Api::Errors::Forbidden.new("app.denied", "You don't have access to this app") unless membership.can?("app.#{app}")
        Tenancy::Context.with(membership.business, user: user, membership: membership) do
          AuditLog.record(action: "login", after: { app: app, ok: true })
          render json: Auth::SessionIssuer.issue(user: user, membership: membership, app: app, request: request)
        end
      end
    end
  end
end

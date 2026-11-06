module Api
  module V1
    class AuthController < BaseController
      # POST /auth/signup  name, business_name, email+password or phone (+otp_code), country, currency, time_zone
      # A phone signed up with its code is proven. A phone given with an email sign-up is not: it goes on the login
      # unproven (it counts for nothing until a code confirms it) and stays off it when another account has it, the
      # business keeping it as its phone. A stranger could sign up with someone's number (QA of 6 Nov 2026, P1).
      def signup
        phone = User.normalize_phone(params[:phone])
        email = params[:email].to_s.strip.downcase.presence
        raise Api::Errors::BadRequest.new("signup.contact_required", "Email and password, or phone with OTP code, is required") if email.blank? && phone.blank?
        code = nil
        if phone.present? && params[:otp_code].present?
          code = OtpCode.check(phone: phone, purpose: "signup", code: params[:otp_code])
          raise Api::Errors::Unauthorized.new("otp.invalid", "The code is wrong or expired") unless code
        elsif email.present?
          raise Api::Errors::BadRequest.new("signup.password_required", "Password is required with email") if params[:password].blank?
        else
          raise Api::Errors::BadRequest.new("signup.otp_required", "Request an OTP for this phone first")
        end
        exists = Api::Errors::Conflict.new("signup.exists", "An account with this email or phone already exists")
        raise exists if email && User.exists?(email: email)
        login_phone = phone
        if phone
          holder, state = Auth::Identity.holder(:phone, phone)
          if code
            # The account the phone belongs to is this person's: they log in. One that holds it unproven beside a way
            # in of its own gives it up to the person who just proved it.
            raise exists if state == :ok
            holder&.release!(:phone)
          elsif holder
            raise exists if holder.verified?(:phone)
            login_phone = nil
          end
        end
        code&.consume!

        result = Auth::Signup.call(name: params.require(:name), business_name: params.require(:business_name), email: email, phone: login_phone, phone_verified: code.present?,
                                   business_phone: phone, password: params[:password], country: params[:country].presence || "PK", currency: params[:currency].presence || "PKR",
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

      # POST /auth/otp/request  phone, purpose (login|signup|verify_phone)
      # The answer is the same whether or not an account has the phone: a login code is only sent to a phone that has
      # one, but the code is made (and the bcrypt paid) either way, so the request cannot tell anyone who has an
      # account (review of 6 Nov 2026, R13). verify_phone confirms a new phone for PATCH /me.
      def otp_request
        phone = User.normalize_phone(params[:phone])
        raise Api::Errors::BadRequest.new("otp.phone_invalid", "Phone must be in international format") unless phone&.match?(/\A\+[1-9]\d{7,14}\z/)
        purpose = params[:purpose].presence_in(%w[login signup verify_phone]) || "login"
        _record, code = OtpCode.issue!(phone: phone, purpose: purpose)
        # A staff invitation waiting for the phone counts as an account: its holder signs in with the code to join.
        reachable = User.exists?(phone: phone) || StaffInvitation.waiting_for(:phone, phone).exists?
        Whatsapp::Sender.send_otp(phone: phone, code: code) unless purpose == "login" && !reachable
        body = { sent: true, phone: phone, expires_in: OtpCode::TTL.to_i }
        body[:dev_code] = code unless Rails.env.production?
        render json: body
      end

      # POST /auth/otp/verify  phone, code, [password], [app], [business_id]
      # The code proves the phone, not the account it sits on. An account that never proved it and has an email of its
      # own is not opened by the code alone: the code is kept and the account's password asked for once, since anyone
      # can type someone's number on their own account (QA of 6 Nov 2026, P1). Staff invitations waiting for the phone
      # join the account the code opens, or a new login when no account has the number.
      # With an invitation waiting, new_login: true joins with a new login instead, the old one letting the number go:
      # the person invited may never have seen the login a stranger put their number on.
      def otp_verify
        phone = User.normalize_phone(params[:phone])
        code = phone && OtpCode.check(phone: phone, purpose: "login", code: params[:code])
        raise Api::Errors::Unauthorized.new("otp.invalid", "The code is wrong or expired") unless code
        waiting = StaffInvitation.waiting_for(:phone, phone).order(:created_at)
        new_login = ActiveModel::Type::Boolean.new.cast(params[:new_login]) && waiting.exists?
        user, state = Auth::Identity.holder(:phone, phone, password: new_login ? nil : params[:password])
        if state == :password && !new_login
          code.fail! if params[:password].present?
          raise Api::Errors::Unauthorized.new("login.invalid", "The password is wrong") if params[:password].present?
          invited = waiting.map { |inv| inv.business.name }.uniq
          raise Api::Errors::Forbidden.new("phone.password_required", "This number is not confirmed on its EasAlpha login yet. Enter that login's password once to confirm it.",
                                           details: { invitations: invited })
        end
        code.consume!
        # A new login only for a number nobody holds, or one held unproven: a proven holder just signs in.
        if state == :none || (state == :password && new_login)
          raise Api::Errors::NotFound unless waiting.exists?
          user = Auth::Identity.new_account!(:phone, phone, name: waiting.last.name)
        end
        user.verify!(:phone) unless user.verified?(:phone)
        joined = Auth::Identity.accept_waiting!(user, :phone, phone)
        issue_for(user, app: params[:app].presence || "admin", joined: joined)
      end

      # POST /auth/password/forgot  email
      # The same answer whether or not an account has the email: the code is made either way and mailed only to an email
      # with a login, as OTP requests do (R13). Five codes an hour for one email; the code lasts 15 minutes.
      def password_forgot
        email = EmailCode.normalize(params.require(:email))
        raise Api::Errors::BadRequest.new("email.invalid", "Enter the email you log in with") unless email&.match?(URI::MailTo::EMAIL_REGEXP)
        _record, code = EmailCode.issue!(email: email, purpose: "reset_password")
        user = User.find_by(email: email)
        AccountMailer.code(email: email, code: code, purpose: "reset_password", name: user.name).deliver_later if code && user && ApplicationMailer.enabled?
        body = { sent: true, expires_in: EmailCode::TTL.to_i }
        body[:dev_code] = code unless Rails.env.production?
        render json: body
      end

      # POST /auth/password/reset  email, code, password
      # The code proves the email: the password is set, every session of the login signed out and the email confirmed. A
      # phone the login never proved goes, since the person resetting showed only the email (QA of 6 Nov 2026, P8).
      def password_reset
        email = EmailCode.normalize(params.require(:email))
        code = EmailCode.check(email: email, purpose: "reset_password", code: params.require(:code))
        user = code && User.find_by(email: email)
        raise Api::Errors::Unauthorized.new("code.invalid", "The code is wrong or expired") unless user
        User.transaction do
          changes = { password: params.require(:password).to_s, email_verified_at: Time.current }
          changes[:phone] = nil if user.phone.present? && !user.verified?(:phone) && !user.verified?(:email)
          user.update!(changes)
          code.consume!
          RefreshToken.where(user_id: user.id, revoked_at: nil).update_all(revoked_at: Time.current)
        end
        render json: { reset: true }
      end

      # POST /auth/refresh  refresh_token
      # Rotates the refresh token. The token spent in the last 30 seconds is answered with the same successor, so two
      # tabs refreshing one session at once both carry on (RefreshToken::REPLAY_WINDOW, review R28).
      def refresh
        active = ->(rt) { raise Api::Errors::Unauthorized.new("session.invalid", "Session is no longer valid") unless rt.membership&.active? }
        rt, successor = RefreshToken.rotate!(params.require(:refresh_token), user_agent: request.user_agent, ip: request.remote_ip, check: active)
        raise Api::Errors::Unauthorized.new("refresh.invalid", "Session expired, log in again") unless rt
        Tenancy::Context.with(rt.membership.business, user: rt.user) do
          render json: Auth::SessionIssuer.issue(user: rt.user, membership: rt.membership, app: rt.app, device: rt.device, request: request, refresh_token: successor)
        end
      end

      # POST /auth/logout  refresh_token
      def logout
        rt = RefreshToken.find_valid(params[:refresh_token].to_s)
        rt&.revoke!
        head :no_content
      end

      # POST /auth/switch  business_id  (requires a valid access token)
      # Only a session the account signed in to itself moves between its businesses: a till's PIN session was opened with
      # a PIN this business set, and must not reach the person's other businesses. The business switched to must open
      # the same app (QA of 6 Nov 2026, P4).
      def switch
        authenticate!
        raise Api::Errors::Forbidden.new("session.switch_denied", "Sign in to the other business itself; this session stays where it was opened") if current_device || support_session?
        app = @claims[:app].presence || "admin"
        membership = Membership.all_for_user(current_user.id).find { |m| m.business_id == params.require(:business_id) }
        raise Api::Errors::NotFound.new("business.not_member", "You are not a member of that business") unless membership && membership.business&.status != "deleted"
        raise Api::Errors::Forbidden.new("app.denied", "You don't have access to this app at #{membership.business.name}") unless membership.can?("app.#{app}")
        Tenancy::Context.with(membership.business, user: current_user) do
          render json: Auth::SessionIssuer.issue(user: current_user, membership: membership, app: app, request: request)
        end
      end

      private

      # joined: memberships an invitation made in this request. Joining as a till cashier opens no admin, which the
      # answer says instead of a bare "no access".
      def issue_for(user, app:, joined: [])
        memberships = Membership.all_for_user(user.id).reject { |m| m.business.nil? || m.business.status == "deleted" }
        raise Api::Errors::Forbidden.new("login.no_business", "This account is not a member of any business") if memberships.empty?
        membership = params[:business_id].present? ? memberships.find { |m| m.business_id == params[:business_id] } : last_used(user, memberships.select { |m| m.can?("app.#{app}") }, app)
        raise Api::Errors::NotFound.new("business.not_member", "You are not a member of that business") if params[:business_id].present? && !membership
        unless membership&.can?("app.#{app}")
          raise Api::Errors::Forbidden.new("app.denied", "You don't have access to this app") if joined.empty?
          list = joined.map { |m| Tenancy::Context.with(m.business) { { business: m.business.name, role: m.role.name } } }
          raise Api::Errors::Forbidden.new("app.denied", "You joined #{list.map { |j| "#{j[:business]} as #{j[:role]}" }.to_sentence}. Sign in on the till with the PIN the owner gives you.", details: { joined: list })
        end
        Tenancy::Context.with(membership.business, user: user, membership: membership) do
          AuditLog.record(action: "login", after: { app: app, ok: true })
          render json: Auth::SessionIssuer.issue(user: user, membership: membership, app: app, request: request)
        end
      end

      # Of the memberships that open the app asked for, the one this person signed in to last, else the latest changed.
      # The newest membership alone locked a manager out of the admin once a till job elsewhere was added (QA of 6 Nov
      # 2026, P4); the others stay a switch away.
      def last_used(user, usable, app)
        return nil if usable.empty?
        recent = RefreshToken.where(user_id: user.id, membership_id: usable.map(&:id), app: app, device_id: nil).order(created_at: :desc).pick(:membership_id)
        usable.find { |m| m.id == recent } || usable.max_by(&:updated_at)
      end
    end
  end
end

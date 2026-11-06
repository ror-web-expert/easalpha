module Api
  module V1
    class MeController < BaseController
      before_action :authenticate!
      before_action :refuse_support!, except: :show

      def show
        render json: {
          user: Serializers.user(current_user),
          business: Serializers.business(current_business),
          branch: current_branch && Serializers.branch(current_branch),
          branches: Branch.active.order(:created_at).map { |b| Serializers.branch(b) },
          membership: Serializers.membership(current_membership, include_user: false),
          permissions: current_membership.permission_codes,
          modules: BusinessModules.all(current_business),
          limits: current_membership.role.role_permissions.where.not(limit_value: nil).pluck(:permission_code, :limit_value).to_h,
          device: current_device && Serializers.device(current_device),
          businesses: Auth::SessionIssuer.businesses_of(current_user),
          checklist: SetupChecklistItem.order(:sort_order).map { |i| Serializers.checklist_item(i) },
          unread_notifications: Notification.unread.where(user_id: [ nil, current_user.id ]).count,
          pills: current_branch ? Reports::Dashboard.pills(current_branch) : nil,
          support: support_session? ? support_info(@support_session) : nil
        }
      end

      # PATCH /me  name, locale, email, phone, password (+ current_password, otp_code, email_code)
      # The email and phone are what the account signs in with and what an owner adding staff links it by. A new one
      # needs the current password, or the code sent to it, which also proves it: a phone's from POST /auth/otp/request
      # (purpose verify_phone), an email's from POST /me/email_code. The account's own phone or email with its code is
      # confirmed. A new password needs the current one. Everything is checked before anything is saved (review of 6 Nov
      # 2026, R8). Only a proven value counts for linking (QA of 6 Nov 2026, P1), so a code also takes the value from an
      # account that holds it unproven. A till's PIN session changes the language only: the business set that PIN, and
      # the login is the person's own wherever they work.
      def update
        attrs = params.permit(:name, :locale, :email, :phone).to_h.symbolize_keys
        if current_device && ((attrs.keys - [ :locale ]).any? || params[:password].present?)
          raise Api::Errors::Forbidden.new("me.pin_session", "Change your name, email, phone or password where you sign in with them, not on a till")
        end
        proof = verify_credentials!(attrs)
        attrs[:phone_verified_at] = Time.current if proof[:phone]
        attrs[:email_verified_at] = Time.current if proof[:email]
        before = current_user.slice(:name, :email, :phone, :locale)
        User.transaction do
          proof[:release].each { |holder, kind| holder.release!(kind) }
          current_user.update!(attrs)
          proof[:codes].each(&:consume!)
          if params[:password].present?
            current_user.update!(password: params[:password])
            current_user.refresh_tokens.where.not(id: nil).update_all(revoked_at: Time.current) if current_user.respond_to?(:refresh_tokens)
          end
        end
        audit!("update", record: current_user, before: before, after: current_user.slice(:name, :email, :phone, :locale))
        render json: Serializers.user(current_user)
      end

      # POST /me/email_code  [email]  a code to confirm this email (the account's own when none is given) for PATCH /me
      def email_code
        raise Api::Errors::Forbidden.new("me.pin_session", "Confirm your email where you sign in with it, not on a till") if current_device
        email = EmailCode.normalize(params[:email].presence || current_user.email)
        raise Api::Errors::BadRequest.new("email.invalid", "Enter a valid email") unless email&.match?(URI::MailTo::EMAIL_REGEXP)
        _record, code = EmailCode.issue!(email: email, purpose: "verify_email")
        raise Api::Errors::Conflict.new("code.too_many", "Too many codes for this email. Try again in an hour.") unless code
        AccountMailer.code(email: email, code: code, purpose: "verify_email", name: current_user.name).deliver_later if ApplicationMailer.enabled?
        body = { sent: true, email: email, expires_in: EmailCode::TTL.to_i }
        body[:dev_code] = code unless Rails.env.production?
        render json: body
      end

      private

      # Raises unless the change is allowed; returns the codes to use up, the values they prove, and the accounts that
      # give a proven value up.
      def verify_credentials!(attrs)
        new_email = EmailCode.normalize(attrs[:email]) if attrs.key?(:email)
        new_phone = User.normalize_phone(attrs[:phone]) if attrs.key?(:phone)
        email_change = attrs.key?(:email) && new_email != current_user.email
        phone_change = attrs.key?(:phone) && new_phone != current_user.phone
        phone_code = new_phone && params[:otp_code].present? ? OtpCode.check(phone: new_phone, purpose: "verify_phone", code: params[:otp_code]) : nil
        email_code = new_email && params[:email_code].present? ? EmailCode.check(email: new_email, purpose: "verify_email", code: params[:email_code]) : nil
        proof = { codes: [ phone_code, email_code ].compact, phone: phone_code.present?, email: email_code.present?, release: [] }
        if params[:password].present? || email_change || phone_change
          password_ok = params[:current_password].present? && current_user.authenticate(params[:current_password].to_s)
          raise Api::Errors::BadRequest.new("password.current_wrong", "The current password is wrong") if !password_ok && (params[:password].present? || params[:current_password].present?)
          if !password_ok && ((phone_change && !phone_code) || (email_change && !email_code))
            raise Api::Errors::BadRequest.new("contact.verification_required", "Enter your current password to change your email or phone, or the code sent to the new one")
          end
        end
        { phone: [ phone_change, new_phone, phone_code ], email: [ email_change, new_email, email_code ] }.each do |kind, (change, value, code)|
          holder = change && value && User.where.not(id: current_user.id).find_by(kind => value)
          next unless holder
          raise Api::Errors::Conflict.new("#{kind}.taken", "This #{kind} is on another EasAlpha login") if holder.verified?(kind) || !code
          proof[:release] << [ holder, kind ]
        end
        proof
      end
    end
  end
end

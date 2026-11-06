module Api
  module V1
    # The invitee's side of a staff invitation (QA of 6 Nov 2026, P1). The link names the invitation; the code sent to
    # the invited phone (WhatsApp) or email proves the person, who joins with the login that phone or email belongs to,
    # or with a new one. No session is needed, and the link alone opens nothing.
    class InvitationsController < BaseController
      # GET /invitations/:token
      def show = render(json: summary(find_invitation!))

      # POST /invitations/:token/code
      def send_code
        inv = find_invitation!(open: true)
        if inv.proof_kind == :phone
          # As the hourly cap on email codes: five WhatsApp codes an hour for one invited phone.
          raise Api::Errors::Conflict.new("code.too_many", "Too many codes for this number. Try again in an hour.") if OtpCode.where(phone: inv.phone, purpose: "invite").where("created_at > ?", 1.hour.ago).count >= EmailCode::HOURLY_LIMIT
          _record, code = OtpCode.issue!(phone: inv.phone, purpose: "invite")
          Whatsapp::Sender.send_otp(phone: inv.phone, code: code)
        else
          _record, code = EmailCode.issue!(email: inv.email, purpose: "invite")
          raise Api::Errors::Conflict.new("code.too_many", "Too many codes for this email. Try again in an hour.") unless code
          AccountMailer.code(email: inv.email, code: code, purpose: "invite", name: inv.name).deliver_later if ApplicationMailer.enabled?
        end
        body = { sent: true, to: masked(inv), expires_in: (inv.proof_kind == :phone ? OtpCode::TTL : EmailCode::TTL).to_i }
        body[:dev_code] = code unless Rails.env.production?
        render json: body
      end

      # POST /invitations/:token/accept  code, [password], [new_login], [new_password]
      # The phone or email on a login that never proved it, beside a way in of its own: the person gives that login's
      # password to join with it, or joins with a new login (new_login: true) and the old one lets the phone or email go.
      def accept
        inv = find_invitation!(open: true)
        kind, value = inv.proof_kind, inv.proof_value
        code = kind == :phone ? OtpCode.check(phone: value, purpose: "invite", code: params[:code]) : EmailCode.check(email: value, purpose: "invite", code: params[:code])
        raise Api::Errors::Unauthorized.new("code.invalid", "The code is wrong or expired") unless code
        new_login = ActiveModel::Type::Boolean.new.cast(params[:new_login])
        user, state = Auth::Identity.holder(kind, value, password: new_login ? nil : params[:password])
        if state == :password && !new_login
          code.fail! if params[:password].present?
          raise Api::Errors::Unauthorized.new("login.invalid", "The password is wrong") if params[:password].present?
          raise Api::Errors::Conflict.new("invitation.sign_in", "This #{kind} is on an EasAlpha login that has not confirmed it. Enter that login's password to join with it, or join with a new login.", details: { kind: kind })
        end
        user = nil if state == :password
        User.transaction do
          code.consume!
          user ||= Auth::Identity.new_account!(kind, value, name: inv.name)
          user.update!(password: params[:new_password]) if params[:new_password].present? && user.password_digest.blank?
          user.verify!(kind) unless user.verified?(kind)
        end
        m = inv.accept!(user)
        Tenancy::Context.with(m.business, user: user, membership: m) do
          if m.can?("app.admin")
            render json: Auth::SessionIssuer.issue(user: user, membership: m, app: "admin", request: request).merge(joined: true), status: :created
          else
            render json: { joined: true, business: { id: m.business_id, name: m.business.name }, role: m.role.name, has_pin: m.pin_digest.present?,
                           message: "You joined #{m.business.name} as #{m.role.name}. Sign in on the till with the PIN the owner gives you." }, status: :created
          end
        end
      end

      private

      def find_invitation!(open: false)
        inv = StaffInvitation.find_by_token(params[:token])
        raise Api::Errors::NotFound.new("invitation.not_found", "This invitation link is not valid") unless inv
        raise Api::Errors::Conflict.new("invitation.closed", "This invitation was cancelled, has expired, or was accepted already") if open && !inv.pending?
        inv
      end

      def summary(inv)
        status = inv.status == "pending" && !inv.pending? ? "expired" : inv.status
        { business: { name: inv.business.name, logo_key: inv.business.logo_key }, role: inv.role.name, name: inv.name, proof: inv.proof_kind, to: masked(inv),
          status: status, expires_at: inv.expires_at }
      end

      # Enough to recognise one's own number or address, not to learn it.
      def masked(inv)
        return "#{inv.phone[0, 3]}#{'*' * [ inv.phone.length - 7, 0 ].max}#{inv.phone[-4..]}" if inv.proof_kind == :phone
        local, domain = inv.email.split("@", 2)
        "#{local[0]}***@#{domain}"
      end
    end
  end
end

module Api
  module V1
    class MeController < BaseController
      before_action :authenticate!

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
          businesses: Membership.all_for_user(current_user.id).map { |m| { id: m.business.id, name: m.business.name, slug: m.business.slug, role: m.role.name } },
          checklist: SetupChecklistItem.order(:sort_order).map { |i| Serializers.checklist_item(i) },
          unread_notifications: Notification.unread.where(user_id: [ nil, current_user.id ]).count,
          pills: current_branch ? Reports::Dashboard.pills(current_branch) : nil
        }
      end

      # PATCH /me  name, locale, email, phone, password (+ current_password, otp_code)
      # The email and phone are what the account signs in with and what an owner adding staff links it by, so a new one
      # needs the current password; a new phone may instead be confirmed with the code sent to it (POST /auth/otp/request
      # with purpose verify_phone). A new password needs the current one. Everything is checked before anything is
      # saved (review of 6 Nov 2026, R8).
      def update
        attrs = params.permit(:name, :locale, :email, :phone).to_h.symbolize_keys
        verify_credentials!(attrs)
        before = current_user.slice(:name, :email, :phone, :locale)
        User.transaction do
          current_user.update!(attrs)
          if params[:password].present?
            current_user.update!(password: params[:password])
            current_user.refresh_tokens.where.not(id: nil).update_all(revoked_at: Time.current) if current_user.respond_to?(:refresh_tokens)
          end
        end
        audit!("update", record: current_user, before: before, after: current_user.slice(:name, :email, :phone, :locale))
        render json: Serializers.user(current_user)
      end

      private

      def verify_credentials!(attrs)
        email_change = attrs.key?(:email) && attrs[:email].to_s.strip.downcase.presence != current_user.email
        new_phone = User.normalize_phone(attrs[:phone]) if attrs.key?(:phone)
        phone_change = attrs.key?(:phone) && new_phone != current_user.phone
        return unless params[:password].present? || email_change || phone_change
        return if params[:current_password].present? && current_user.authenticate(params[:current_password].to_s)
        raise Api::Errors::BadRequest.new("password.current_wrong", "The current password is wrong") if params[:password].present? || params[:current_password].present?
        return if phone_change && !email_change && new_phone && params[:otp_code].present? && OtpCode.verify!(phone: new_phone, purpose: "verify_phone", code: params[:otp_code])
        raise Api::Errors::BadRequest.new("contact.verification_required", "Enter your current password to change your email or phone, or for a phone the code sent to the new number")
      end
    end
  end
end

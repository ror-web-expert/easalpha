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

      def update
        before = current_user.slice(:name, :email, :phone, :locale)
        current_user.update!(params.permit(:name, :locale, :email, :phone))
        if params[:password].present?
          raise Api::Errors::BadRequest.new("password.current_wrong", "The current password is wrong") unless current_user.authenticate(params[:current_password].to_s)
          current_user.update!(password: params[:password])
          current_user.refresh_tokens.where.not(id: nil).update_all(revoked_at: Time.current) if current_user.respond_to?(:refresh_tokens)
        end
        audit!("update", record: current_user, before: before, after: current_user.slice(:name, :email, :phone, :locale))
        render json: Serializers.user(current_user)
      end
    end
  end
end

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
          limits: current_membership.role.role_permissions.where.not(limit_value: nil).pluck(:permission_code, :limit_value).to_h,
          device: current_device && Serializers.device(current_device),
          businesses: Membership.all_for_user(current_user.id).map { |m| { id: m.business.id, name: m.business.name, slug: m.business.slug, role: m.role.name } },
          checklist: SetupChecklistItem.order(:sort_order).map { |i| Serializers.checklist_item(i) },
          unread_notifications: Notification.unread.where(user_id: [nil, current_user.id]).count
        }
      end

      def update
        before = current_user.slice(:name, :email, :phone, :locale)
        current_user.update!(params.permit(:name, :locale, :email, :phone))
        current_user.update!(password: params[:password]) if params[:password].present? && current_user.authenticate(params[:current_password].to_s)
        audit!("update", record: current_user, before: before, after: current_user.slice(:name, :email, :phone, :locale))
        render json: Serializers.user(current_user)
      end
    end
  end
end

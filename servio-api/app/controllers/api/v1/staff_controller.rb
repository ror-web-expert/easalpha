module Api
  module V1
    class StaffController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage") }, except: [:index, :show]

      def index
        scope = Membership.includes(:user, :role).order(:created_at)
        scope = scope.where(status: params[:status]) if params[:status].present?
        render json: { data: scope.map { |m| Serializers.membership(m) } }
      end

      def show
        render json: Serializers.membership(Membership.includes(:user, :role).find(params[:id]))
      end

      # POST /staff  name, phone|email, role_id, branch_ids|all_branches, pin, [password]
      def create
        read_only_guard!
        role = Role.active.find(params.require(:role_id))
        raise Api::Errors::Forbidden.new("staff.owner_role", "Use the owner transfer to add another owner") if role.owner?
        limit = current_business.plan_limit("staff")
        raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} staff. Upgrade to add more.") if limit && Membership.active.count >= limit
        phone = User.normalize_phone(params[:phone])
        email = params[:email].to_s.strip.downcase.presence
        user = (phone && User.find_by(phone: phone)) || (email && User.find_by(email: email)) ||
               User.create!(name: params.require(:name), phone: phone, email: email, password: params[:password].presence)
        raise Api::Errors::Conflict.new("staff.exists", "This person is already a member") if Membership.exists?(user_id: user.id)
        m = Membership.create!(user: user, role: role, status: "active", all_branches: params[:all_branches].nil? ? params[:branch_ids].blank? : ActiveModel::Type::Boolean.new.cast(params[:all_branches]),
                               branch_ids: Array(params[:branch_ids]), invited_via: phone ? "whatsapp" : "email")
        m.set_pin!(params[:pin]) if params[:pin].present?
        Whatsapp::Sender.deliver(phone: phone, template: "staff_invite", variables: { business: current_business.name, role: role.name }) if phone
        audit!("create", record: m, after: { user_id: user.id, role: role.name })
        SetupChecklistItem.complete!("staff")
        render json: Serializers.membership(m), status: :created
      end

      def update
        read_only_guard!
        m = Membership.includes(:user, :role).find(params[:id])
        before = Serializers.membership(m, include_user: false)
        if params[:role_id].present?
          role = Role.active.find(params[:role_id])
          raise Api::Errors::Forbidden.new("staff.last_owner", "The last owner cannot lose the owner role") if m.owner? && !role.owner? && Membership.active.joins(:role).where(roles: { system_key: "owner" }).count <= 1
          m.role = role
        end
        m.all_branches = ActiveModel::Type::Boolean.new.cast(params[:all_branches]) unless params[:all_branches].nil?
        m.branch_ids = Array(params[:branch_ids]) if params.key?(:branch_ids)
        m.save!
        m.user.update!(name: params[:name]) if params[:name].present?
        audit!("permission_change", record: m, before: before, after: Serializers.membership(m, include_user: false))
        render json: Serializers.membership(m)
      end

      def set_pin
        read_only_guard!
        m = Membership.find(params[:id])
        m.set_pin!(params.require(:pin))
        audit!("update", record: m, after: { pin: "changed" })
        render json: Serializers.membership(m)
      end

      def deactivate
        m = Membership.includes(:role).find(params[:id])
        raise Api::Errors::Forbidden.new("staff.last_owner", "The last owner cannot be deactivated") if m.owner? && Membership.active.joins(:role).where(roles: { system_key: "owner" }).count <= 1
        raise Api::Errors::Forbidden.new("staff.self", "You cannot deactivate yourself") if m.id == current_membership.id
        m.deactivate!
        audit!("permission_change", record: m, after: { status: "deactivated" })
        render json: Serializers.membership(m)
      end

      def reactivate
        read_only_guard!
        m = Membership.find(params[:id])
        m.update!(status: "active", deactivated_at: nil)
        audit!("permission_change", record: m, after: { status: "active" })
        render json: Serializers.membership(m)
      end
    end
  end
end

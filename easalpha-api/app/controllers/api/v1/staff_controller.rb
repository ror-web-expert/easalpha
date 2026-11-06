module Api
  module V1
    class StaffController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage") }, except: [ :index, :show, :permissions, :sessions ]

      def index
        scope = Membership.includes(:user, :role).order(:created_at)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.of_type(params[:staff_type]) if params[:staff_type].present?
        scope = scope.where(cashier_role: params[:cashier_role]) if params[:cashier_role].present?
        render json: { data: scope.map { |m| Serializers.membership(m) } }
      end

      def show
        render json: Serializers.membership(Membership.includes(:user, :role).find(params[:id]))
      end

      # POST /staff  name, phone|email, role_id, branch_ids|all_branches, pin, [password]
      # A phone or email that already has an EasAlpha account links that account as it is: its holder's name and
      # password stay, and a password sent here is not used. Only a brand-new login gets the name and password the
      # owner typed. The answer says linked_existing_user so the screen can tell the owner (review of 6 Nov 2026, R8).
      def create
        read_only_guard!
        role = Role.active.find(params.require(:role_id))
        raise Api::Errors::Forbidden.new("staff.owner_role", "Use the owner transfer to add another owner") if role.owner?
        limit = current_business.plan_limit("staff")
        raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} staff. Upgrade to add more.") if limit && Membership.active.count >= limit
        phone = User.normalize_phone(params[:phone])
        email = params[:email].to_s.strip.downcase.presence
        existing = (phone && User.find_by(phone: phone)) || (email && User.find_by(email: email))
        user = existing || User.create!(name: params.require(:name), phone: phone, email: email, password: params[:password].presence)
        raise Api::Errors::Conflict.new("staff.exists", "This person is already a member") if Membership.exists?(user_id: user.id)
        staff_type = params[:staff_type].presence || Membership.staff_type_for(role)
        cashier_role = params[:cashier_role].presence || Membership.cashier_role_for(role)
        m = Membership.create!(user: user, role: role, status: "active", all_branches: params[:all_branches].nil? ? params[:branch_ids].blank? : ActiveModel::Type::Boolean.new.cast(params[:all_branches]),
                               branch_ids: Array(params[:branch_ids]), invited_via: phone ? "whatsapp" : "email", staff_type: staff_type, cashier_role: cashier_role)
        m.set_pin!(params[:pin]) if params[:pin].present?
        Whatsapp::Sender.deliver(phone: phone, template: "staff_invite", variables: { business: current_business.name, role: role.name }) if phone
        audit!("create", record: m, after: { user_id: user.id, role: role.name, linked_existing_user: existing.present? })
        SetupChecklistItem.complete!("staff")
        render json: Serializers.membership(m).merge(linked_existing_user: existing.present?), status: :created
      end

      def update
        read_only_guard!
        m = Membership.includes(:user, :role).find(params[:id])
        before = Serializers.membership(m, include_user: false)
        rename = params[:name].present? && params[:name] != m.user.name
        raise Api::Errors::Forbidden.new("staff.linked_user", "#{m.user.name} signs in with their own EasAlpha account; only they can change its name") if rename && !own_login?(m)
        if params[:role_id].present?
          role = Role.active.find(params[:role_id])
          raise Api::Errors::Forbidden.new("staff.last_owner", "The last owner cannot lose the owner role") if m.owner? && !role.owner? && Membership.active.joins(:role).where(roles: { system_key: "owner" }).count <= 1
          m.role = role
        end
        m.all_branches = ActiveModel::Type::Boolean.new.cast(params[:all_branches]) unless params[:all_branches].nil?
        m.branch_ids = Array(params[:branch_ids]) if params.key?(:branch_ids)
        m.staff_type = params[:staff_type] if params[:staff_type].present?
        m.cashier_role = params[:cashier_role] if params.key?(:cashier_role)
        m.save!
        m.user.update!(name: params[:name]) if rename
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

      # GET /staff/sessions  [active=true] [membership_id]  SPEC User Sessions screen
      def sessions
        raise Api::Errors::Forbidden.new("permission.denied", "Missing permission: staff.manage") unless current_membership.can?("staff.manage") || params[:membership_id] == current_membership.id
        members = Membership.includes(:user).index_by(&:id)
        scope = RefreshToken.where(membership_id: members.keys).includes(:device).order(created_at: :desc)
        scope = scope.where(membership_id: params[:membership_id]) if params[:membership_id].present?
        scope = scope.valid if ActiveModel::Type::Boolean.new.cast(params[:active])
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
        render_page(rows, cursor) { |rt| Serializers.user_session(rt, membership: members[rt.membership_id]) }
      end

      # POST /staff/sessions/:id/revoke  signs that session out everywhere it is used
      def revoke_session
        rt = RefreshToken.where(membership_id: Membership.select(:id)).find(params[:id])
        rt.revoke! unless rt.revoked_at
        audit!("logout", table_name: "refresh_tokens", record_id: rt.id, after: { revoked_by: current_user.id, membership_id: rt.membership_id })
        render json: Serializers.user_session(rt)
      end

      # GET /staff/:id/permissions  the editor's data: mode, granted codes, effective codes, granted-of-total per module
      def permissions
        m = Membership.includes(:role).find(params[:id])
        raise Api::Errors::Forbidden.new("permission.denied", "Missing permission: staff.manage") unless m.id == current_membership.id || current_membership.can?("staff.manage")
        render json: permissions_payload(m)
      end

      # PUT /staff/:id/permissions  codes: [..] | preset: cashier|supervisor|manager | select_all: true | reset: true
      def set_permissions
        read_only_guard!
        m = Membership.includes(:role, :user).find(params[:id])
        before = permissions_payload(m)
        if ActiveModel::Type::Boolean.new.cast(params[:reset])
          m.reset_permissions_to_role!
        else
          codes = if ActiveModel::Type::Boolean.new.cast(params[:select_all]) then Permission.spec_codes
          elsif params[:preset].present? then PermissionPreset.codes_for(params[:preset])
          else Array(params.require(:codes))
          end
          guard_escalation!(codes)
          m.set_permissions!(codes, granted_by: current_user)
        end
        after = permissions_payload(m.reload)
        audit!("permission_change", record: m, before: before.slice(:mode, :granted), after: after.slice(:mode, :granted))
        render json: after
      end

      def reactivate
        read_only_guard!
        m = Membership.find(params[:id])
        m.update!(status: "active", deactivated_at: nil)
        audit!("permission_change", record: m, after: { status: "active" })
        render json: Serializers.membership(m)
      end

      private

      # A login this business made: the user was created with this membership (POST /staff for a new person) and no
      # other business has them. The owner may correct its name; an account that was linked, or that works elsewhere
      # too, keeps the name its holder gave it (R8). Under row-level security the other businesses are not visible
      # here, so the creation time is what tells a linked account apart.
      def own_login?(m)
        made_here = m.user.created_at <= m.created_at && m.user.created_at > m.created_at - 1.minute
        made_here && !Membership.unscoped.where(user_id: m.user_id).where.not(business_id: m.business_id).exists?
      end

      def permissions_payload(m)
        granted = m.granted_codes
        { membership_id: m.id, mode: m.permissions_mode, owner: m.owner?, granted: granted, effective: Permission.expand(granted),
          modules: Permission.module_counts(Permission.expand(granted)), takes_effect: "next sign-in" }
      end
    end
  end
end

module Api
  module V1
    class StaffController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("staff.manage") }, except: [ :index, :show, :permissions, :sessions ]
      before_action :refuse_support!, except: [ :index, :show, :permissions, :sessions ]

      def index
        scope = Membership.includes(:user, :role).order(:created_at)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.of_type(params[:staff_type]) if params[:staff_type].present?
        scope = scope.where(cashier_role: params[:cashier_role]) if params[:cashier_role].present?
        render json: { data: scope.map { |m| member_json(m) } }
      end

      def show
        render json: member_json(Membership.includes(:user, :role).find(params[:id]))
      end

      # POST /staff  name, phone|email, role_id, branch_ids|all_branches, pin, [password]
      # A phone or email that already has an EasAlpha account links that account as it is: its holder's name and
      # password stay, and a password sent here is not used. Only a brand-new login gets the name and password the
      # owner typed. The answer says linked_existing_user so the screen can tell the owner (review of 6 Nov 2026, R8).
      # An account is linked only by a phone or email it proved, or when that is its only way in; any other match waits
      # as an invitation the person accepts by proving the phone or email: 202 { invited: true, invitation } (QA of 6 Nov
      # 2026, P1: a stranger who had signed up with a cashier's phone was linked in her place).
      def create
        read_only_guard!
        role = Role.active.find(params.require(:role_id))
        raise Api::Errors::Forbidden.new("staff.owner_role", "Use the owner transfer to add another owner") if role.owner?
        limit = current_business.plan_limit("staff")
        raise Api::Errors::Forbidden.new("plan.limit", "Your plan allows #{limit} staff. Upgrade to add more.") if limit && Membership.active.count >= limit
        raise Membership::PinTaken if params[:pin].present? && Membership.new(business: current_business).pin_taken?(params[:pin].to_s)
        phone = User.normalize_phone(params[:phone])
        email = params[:email].to_s.strip.downcase.presence
        holder = Staff::Linking.any_holder(phone: phone, email: email)
        raise Api::Errors::Conflict.new("staff.exists", "This person is already a member") if holder && Membership.exists?(user_id: holder.id)
        staff_type = params[:staff_type].presence || Membership.staff_type_for(role)
        cashier_role = params[:cashier_role].presence || Membership.cashier_role_for(role)
        all_branches = params[:all_branches].nil? ? params[:branch_ids].blank? : ActiveModel::Type::Boolean.new.cast(params[:all_branches])
        link = Staff::Linking.resolve(phone: phone, email: email)
        if link.invite
          inv = StaffInvitation.invite!(role: role, name: params.require(:name), phone: phone, email: email, staff_type: staff_type, cashier_role: cashier_role,
                                        all_branches: all_branches, branch_ids: Array(params[:branch_ids]), pin: params[:pin])
          return render json: { invited: true, invitation: Serializers.staff_invitation(inv) }, status: :accepted
        end
        existing = link.user
        m = Membership.transaction do
          user = existing || User.create!(name: params.require(:name), phone: phone, email: email, password: params[:password].presence)
          created = Membership.create!(user: user, role: role, status: "active", all_branches: all_branches,
                                       branch_ids: Array(params[:branch_ids]), invited_via: phone ? "whatsapp" : "email", staff_type: staff_type, cashier_role: cashier_role)
          created.set_pin!(params[:pin]) if params[:pin].present?
          Riders::Profile.ensure_for!(created) # on the Rider role: the rider app needs the profile POST /riders makes
          created
        end
        user = m.user
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
        role_changed = m.role_id_changed?
        Membership.transaction do
          m.save!
          Riders::Profile.ensure_for!(m) if role_changed # moved onto the Rider role: their rider profile
        end
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

      # GET /staff/invitations  people added by a phone or email they have not proved yet, until they join
      def invitations
        render json: { data: StaffInvitation.pending.includes(:role).order(created_at: :desc).map { |i| Serializers.staff_invitation(i) } }
      end

      # POST /staff/invitations/:id/resend  the message again, and two more weeks to accept
      def resend_invitation
        inv = StaffInvitation.pending.find(params[:id])
        inv.update!(expires_at: StaffInvitation::TTL.from_now)
        inv.deliver!
        render json: Serializers.staff_invitation(inv)
      end

      def cancel_invitation
        inv = StaffInvitation.where(status: "pending").find(params[:id])
        inv.update!(status: "cancelled")
        head :no_content
      end

      def reactivate
        read_only_guard!
        m = Membership.find(params[:id])
        raise Api::Errors::Conflict.new("pin.taken", "#{m.user.name}'s PIN is now used by another active member. Set a new PIN for #{m.user.name} first.") if m.pin_clashes?
        m.update!(status: "active", deactivated_at: nil)
        audit!("permission_change", record: m, after: { status: "active" })
        render json: Serializers.membership(m)
      end

      private

      def member_json(m)
        current_membership.can?("staff.manage") || m.id == current_membership.id ? Serializers.membership(m) : Serializers.membership_listing(m)
      end

      # A login this business made: the user was created with this membership (POST /staff for a new person) and no
      # other business has them. The owner may correct its name; an account that was linked, or that works elsewhere
      # too, keeps the name its holder gave it (R8). Under row-level security the other businesses are not visible
      # here, so the creation time is what tells a linked account apart.
      def own_login?(m)
        made_here = m.user.created_at <= m.created_at && m.user.created_at > m.created_at - 1.minute
        made_here && !Membership.unscoped.where(user_id: m.user_id).where.not(business_id: m.business_id).exists?
      end

      # apps: what the set opens, so the editor can say when a save leaves someone unable to sign in where they work
      # (QA of 6 Nov 2026, S4: "Access saved", then "You don't have access to this app").
      def permissions_payload(m)
        granted = m.granted_codes
        effective = Permission.expand(granted)
        { membership_id: m.id, mode: m.permissions_mode, owner: m.owner?, granted: granted, effective: effective,
          modules: Permission.module_counts(effective), apps: Auth::SessionIssuer::APPS.select { |a| effective.include?("app.#{a}") }, takes_effect: "next sign-in" }
      end
    end
  end
end

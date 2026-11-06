module Api
  module V1
    # Riders, their cash float (issue, return, spend, adjust, statement) and settlement at shift end.
    class RidersController < BaseController
      before_action :authenticate!
      # SPEC Riders (9): RIDERS, RIDER_VIEW/CREATE/EDIT/DELETE for permanent riders, DUMMY_RIDER_* for temporary ones.
      before_action -> { require_permission!("RIDERS", "RIDER_VIEW", "DUMMY_RIDER_VIEW", "orders.create", "reports.view_all") }, only: %i[index show statement settlement_preview settlements deliveries]
      before_action -> { require_permission!(temporary_request? ? "DUMMY_RIDER_CREATE" : "RIDER_CREATE") }, only: :create
      before_action -> { require_permission!(Rider.find(params[:id]).temporary ? "DUMMY_RIDER_EDIT" : "RIDER_EDIT") }, only: :update
      before_action -> { require_permission!(Rider.find(params[:id]).temporary ? "DUMMY_RIDER_DELETE" : "RIDER_DELETE") }, only: :destroy
      before_action -> { require_permission!("cash.in_out", "shifts.any", "staff.manage") }, only: %i[float settle]
      before_action :read_only_guard!, except: %i[index show statement settlement_preview settlements deliveries]

      def index
        scope = Rider.active.order(:name)
        scope = scope.where("branch_id = ? OR branch_id IS NULL", current_branch.id) unless params[:all_branches] == "true"
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(temporary: params[:temporary] == "true") if params[:temporary].present?
        scope = scope.where(temporary: false) unless current_membership.can?("DUMMY_RIDER_VIEW") || current_membership.can?("RIDERS") || current_membership.can?("riders.manage")
        rows = scope.to_a
        counts = DeliverySerializers.rider_counts(rows.map(&:id))
        render json: { data: rows.map { |r| DeliverySerializers.rider(r, counts: counts).merge(open_deliveries: counts[r.id][:open]) } }
      end

      def show = render(json: DeliverySerializers.rider(Rider.find(params[:id])))

      # POST /riders { name, phone, vehicle, vehicle_no, address, charge_per_delivery_minor, membership_id?, create_login: true }
      # Temporary: { temporary: true, lifetime_kind: one_order|n_orders|rest_of_today|n_hours, lifetime_value, permissions: [] }
      def create
        r = nil
        Rider.transaction do
          attrs = rider_params
          if temporary_request?
            life = Rider.lifetime_for(params[:lifetime_kind].to_s, params[:lifetime_value], branch: current_branch) or raise Api::Errors::BadRequest.new("rider.lifetime", "Choose a lifetime: one order, N orders, the rest of today or N hours")
            attrs.merge!(temporary: true, lifetime_kind: params[:lifetime_kind].to_s, lifetime_value: params[:lifetime_value].presence&.to_i, permissions: Array(params[:permissions]).map(&:to_s), created_by_membership_id: current_membership.id, **life)
          end
          invite = nil
          rider_member = nil
          if ActiveModel::Type::Boolean.new.cast(params[:create_login]) && attrs[:membership_id].blank?
            refuse_support! # a rider login is a way in
            phone = User.normalize_phone(attrs[:phone])
            holder = Staff::Linking.any_holder(phone: phone, email: nil)
            member = holder && Membership.includes(:user, :role).find_by(user_id: holder.id)
            raise Membership::PinTaken if params[:pin].present? && (member || Membership.new(business: current_business)).pin_taken?(params[:pin].to_s)
            if member
              # Already on the team. A member on the Rider role with no active rider profile (put on it from Staff before
              # 7 Nov 2026, or deactivated) gets this one on the login they have, as the rider app asks the owner to do;
              # anyone else is told why in words the page can show, not "User has already been taken".
              has_profile = Rider.active.exists?(membership_id: member.id)
              rider_member = member if member.active? && Riders::Profile.rider_role?(member.role) && !has_profile
              unless rider_member
                why = if !member.active? then "is a deactivated member of your staff with this phone. Reactivate them in Staff first, or add this rider without a login."
                elsif has_profile then "already has a rider profile with this phone."
                else "is already on your staff with this phone. Put them on the Rider role in Staff and their rider profile is made, or add this rider without a login."
                end
                raise Api::Errors::Conflict.new("staff.exists", "#{member.user.name} #{why}")
              end
              @linked_existing_user = true
            else
              # As adding staff: a login is linked only by a phone it proved, or that is its only way in; else the rider
              # joins by proving the phone (QA of 6 Nov 2026, P1).
              link = Staff::Linking.resolve(phone: phone, email: nil)
              @linked_existing_user = link.user.present?
              if link.invite
                invite = { role: Role.find_by!(system_key: "rider"), name: attrs[:name], phone: phone, email: nil, staff_type: "rider", cashier_role: nil,
                           all_branches: false, branch_ids: [ current_branch.id ], pin: params[:pin] }
              else
                user = link.user || User.create!(name: attrs[:name], phone: attrs[:phone])
                m = Membership.create!(user: user, role: Role.find_by!(system_key: "rider"), status: "active", all_branches: false, branch_ids: [ current_branch.id ])
                m.set_pin!(params[:pin]) if params[:pin].present?
                attrs[:membership_id] = m.id
              end
            end
          end
          branch_id = params[:branch_id].presence || current_branch.id
          if rider_member
            rider_member.set_pin!(params[:pin]) if params[:pin].present?
            r = Riders::Profile.ensure_for!(rider_member) # their deactivated profile, or one without a login on this phone, or a new one
            r.update!(attrs.except(:membership_id).merge(branch_id: branch_id))
          else
            r = Rider.create!(attrs.merge(branch_id: branch_id))
          end
          @invitation = StaffInvitation.invite!(**invite, rider_id: r.id) if invite
        end
        audit!("create", record: r, after: { name: r.name })
        # What the Riders page tells the owner: an invitation waiting for the rider to prove the phone, or a login of
        # theirs that was linked, rather than a rider row whose login just says "none".
        body = DeliverySerializers.rider(r)
        body = body.merge(invited: true, invitation: Serializers.staff_invitation(@invitation)) if @invitation
        body = body.merge(linked_existing_user: @linked_existing_user) unless @linked_existing_user.nil?
        render json: body, status: :created
      end

      def update
        r = Rider.active.find(params[:id])
        r.update!(rider_params)
        render json: DeliverySerializers.rider(r)
      end

      # SPEC: a rider on past orders is deactivated instead of deleted; a temporary rider with no orders is removed.
      def destroy
        r = Rider.active.find(params[:id])
        raise Api::Errors::Conflict.new("rider.has_float", "#{r.name} still holds Rs #{r.float_minor / 100}; settle first") unless r.float_minor.zero?
        raise Api::Errors::Conflict.new("rider.has_deliveries", "#{r.name} has unsettled deliveries") if r.unsettled_deliveries.exists?
        if r.temporary && !r.deliveries.exists? && !r.cash_movements.exists?
          r.destroy!
        else
          r.update!(archived_at: Time.current, active: false, status: "offline")
        end
        head :no_content
      end

      # POST /riders/:id/float { kind: issue|return|spend|adjust, amount_minor, reason, category_id? }
      def float
        r = Rider.active.find(params[:id])
        m = Riders::Float.move!(r, kind: params.require(:kind), amount_minor: params.require(:amount_minor).to_i, actor: current_membership, branch: current_branch, shift: current_shift, reason: params[:reason], category_id: params[:category_id].presence)
        render json: { movement: DeliverySerializers.movement(m), rider: DeliverySerializers.rider(r.reload) }, status: :created
      end

      def statement
        r = Rider.find(params[:id])
        from = params[:from].present? ? Date.parse(params[:from]) : nil
        to = params[:to].present? ? Date.parse(params[:to]) : nil
        render json: Riders::Float.statement(r, from: from, to: to)
      end

      def settlement_preview = render(json: Riders::Float.preview(Rider.find(params[:id])))

      # POST /riders/:id/settle { handed_in_minor, note, keep_float }
      def settle
        r = Rider.active.find(params[:id])
        s = Riders::Float.settle!(r, handed_in_minor: params.require(:handed_in_minor).to_i, actor: current_membership, branch: current_branch, shift: current_shift, device: current_device,
                                     note: params[:note], keep_float: ActiveModel::Type::Boolean.new.cast(params[:keep_float]))
        render json: { settlement: DeliverySerializers.settlement(s), rider: DeliverySerializers.rider(r.reload) }, status: :created
      end

      def settlements
        rows, cursor = Paginator.call(RiderSettlement.where(rider_id: params[:id]).includes(:rider), cursor: params[:cursor], limit: params[:limit], order_column: :settled_at)
        render_page(rows, cursor) { |s| DeliverySerializers.settlement(s) }
      end

      def deliveries
        scope = Delivery.where(rider_id: params[:id]).includes(:rider, :zone, order: :customer).order(created_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |d| DeliverySerializers.delivery(d) }
      end

      private

      def rider_params = params.permit(:name, :phone, :vehicle, :vehicle_no, :address, :charge_per_delivery_minor, :membership_id, :status, :active, permissions: []).to_h.symbolize_keys
      def temporary_request? = ActiveModel::Type::Boolean.new.cast(params[:temporary])
    end
  end
end

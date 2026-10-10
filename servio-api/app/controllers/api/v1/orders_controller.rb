module Api
  module V1
    class OrdersController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!, except: %i[index show summary]

      # GET /orders?business_day=&status=&order_type=&source=&payment_status=&q=&open=true
      def index
        require_permission!("orders.create", "reports.view_all", "reports.view_branch", "reports.view_own", "kitchen.view")
        scope = Order.includes(:dining_table, :items).where(branch_id: current_branch.id)
        scope = scope.on_day(params[:business_day].presence || current_branch.business_day_for(Time.current)) unless params[:all_days] == "true" || params[:preorders] == "true"
        scope = scope.open if params[:open] == "true"
        scope = scope.where.not(scheduled_for: nil).reorder(:scheduled_for) if params[:preorders] == "true"
        %i[status order_type source payment_status customer_id rider_id table_id].each { |f| scope = scope.where(f => params[f]) if params[f].present? }
        scope = scope.where(taken_by_membership_id: current_membership.id) if only_own?
        if params[:q].present?
          q = params[:q].to_s.strip
          scope = q.match?(/\A#?\d+\z/) ? scope.where(serial: q.delete("#").to_i) : scope.where("orders.till_serial ILIKE :q OR orders.guest_name ILIKE :q OR orders.notes ILIKE :q", q: "%#{q}%")
        end
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |o| OrderSerializers.summary(o) }
      end

      # GET /orders/summary?business_day=  totals for the day: paid, open, voided, counts by type and status
      def summary
        require_permission!("orders.create", "reports.view_all", "reports.view_branch")
        day = params[:business_day].presence || current_branch.business_day_for(Time.current)
        scope = Order.where(branch_id: current_branch.id, business_day: day)
        paid = scope.where(status: %w[paid closed])
        open = scope.open
        render json: {
          business_day: day,
          orders: scope.count, paid_orders: paid.count, open_orders: open.count, voided_orders: scope.where(status: "voided").count,
          revenue_minor: paid.sum(:total_minor), open_minor: open.sum(:total_minor), voided_minor: scope.where(status: "voided").sum(:total_minor),
          discount_minor: paid.sum(:discount_minor), tax_minor: paid.sum(:tax_minor), service_charge_minor: paid.sum(:service_charge_minor),
          average_order_minor: paid.count.zero? ? 0 : paid.sum(:total_minor) / paid.count,
          by_type: scope.group(:order_type).count, by_status: scope.group(:status).count, by_source: scope.group(:source).count,
          staff_meals: scope.where(is_staff_meal: true).count
        }
      end

      def show
        order = Order.includes(items: :modifiers).find(params[:id])
        render json: OrderSerializers.full(order)
      end

      # POST /orders  { id?, order_type, source, table_id, guest_name, covers, customer_id, notes, client_created_at, till_serial, lines: [...], place: true|false,
      #                 is_staff_meal, staff_meal_reason, approver_pin }
      def create
        require_permission!("orders.create")
        if params[:id].present? && (existing = Order.find_by(id: params[:id]))
          return render json: OrderSerializers.full(existing), status: :ok
        end
        approvals = collect_approvals
        attrs = order_attrs
        if attrs[:is_staff_meal]
          attrs[:staff_meal_approved_by_id] = (approvals["orders.staff_meal"] || require_approval!("orders.staff_meal")).id
        end
        day_lock_guard!(current_branch.business_day_for(attrs[:client_created_at].present? ? Time.iso8601(attrs[:client_created_at].to_s) : Time.current))
        builder = Orders::Builder.create!(attrs, lines: lines_param, actor: current_membership, device: current_device, branch: current_branch, approvals: approvals)
        order = builder.order
        audit!("create", record: order, after: { total_minor: order.total_minor, items: order.items.size })
        Orders::Transitions.place!(order, actor: current_membership, device: current_device) if ActiveModel::Type::Boolean.new.cast(params[:place])
        render json: OrderSerializers.full(order.reload), status: :created
      end

      # PATCH /orders/:id  same payload as create (lines replace the current lines; omit lines to leave them)
      def update
        require_permission!("orders.create")
        order = Order.includes(items: :modifiers).find(params[:id])
        approvals = collect_approvals
        builder = Orders::Builder.new(order, actor: current_membership, device: current_device, branch: current_branch)
        builder.update!(attrs: order_attrs.except(:id, :is_staff_meal, :staff_meal_reason), lines: lines_param, approvals: approvals)
        Orders::Transitions.after_edit!(order, added: builder.added, removed: builder.removed)
        audit!("update", record: order, after: { total_minor: order.total_minor, added: builder.added.size, removed: builder.removed.size })
        render json: OrderSerializers.full(order.reload)
      end

      def place
        require_permission!("orders.create")
        order = Order.find(params[:id])
        Orders::Transitions.place!(order, actor: current_membership, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      def hold
        require_permission!("orders.create")
        render json: OrderSerializers.full(Orders::Transitions.hold!(Order.find(params[:id]), actor: current_membership, device: current_device))
      end

      def resume
        require_permission!("orders.create")
        render json: OrderSerializers.full(Orders::Transitions.resume!(Order.find(params[:id]), actor: current_membership, device: current_device))
      end

      def serve
        require_permission!("orders.create")
        render json: OrderSerializers.full(Orders::Transitions.serve!(Order.find(params[:id]), actor: current_membership, device: current_device))
      end

      def close
        require_permission!("orders.create")
        render json: OrderSerializers.full(Orders::Transitions.close!(Order.find(params[:id]), actor: current_membership, device: current_device))
      end

      # POST /orders/:id/void  reason, approver_pin
      def void
        require_permission!("orders.create")
        order = Order.find(params[:id])
        reason = params.require(:reason).to_s.strip
        raise Api::Errors::BadRequest.new("void.reason_required", "A reason is required") if reason.blank?
        approver = require_approval!("orders.void")
        Orders::Transitions.void!(order, reason: reason, actor: current_membership, approver: approver == current_membership ? nil : approver, device: current_device)
        render json: OrderSerializers.full(order.reload)
      end

      # POST /orders/:id/discounts  kind (percent|fixed|promotion), value, reason, order_item_id?, coupon_code?, approver_pin?
      def add_discount
        require_permission!("orders.create", "discounts.apply")
        order = Order.includes(items: :modifiers).find(params[:id])
        raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
        kind, value, promotion = params[:kind].to_s, params[:value].to_d, nil
        if params[:coupon_code].present?
          promotion = Promotion.active.find_by(coupon_code: params[:coupon_code].to_s.strip.upcase)
          raise Api::Errors::NotFound.new("coupon.invalid", "This coupon does not exist") unless promotion
          raise Api::Errors::Conflict.new("coupon.unavailable", "This coupon is not valid right now") unless promotion.available_at?(Time.current, zone: current_business.time_zone)
          kind = promotion.kind == "fixed" ? "fixed" : "promotion"
          value = promotion.value
        end
        approver = nil
        if kind != "promotion" && kind != "fixed" || promotion.nil?
          limit = current_membership.limit_for("discounts.apply")
          over = kind == "percent" ? (limit && value > limit) : (limit && order.subtotal_minor.positive? && (value * 100 * 100 / order.subtotal_minor) > limit)
          approver = require_approval!("discounts.above_limit") if over || !current_membership.can?("discounts.apply")
        end
        raise Api::Errors::BadRequest.new("discount.reason_required", "A reason is required") if promotion.nil? && current_business.setting("discount_requires_reason") && params[:reason].blank?
        d = order.discounts.create!(kind: kind, value: value, reason: params[:reason].presence || promotion&.name, order_item_id: params[:order_item_id].presence, promotion_id: promotion&.id,
                                    applied_by_membership_id: current_membership.id, approved_by_membership_id: approver && approver != current_membership ? approver.id : nil)
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        promotion&.increment!(:units_sold)
        audit!("discount", record: order, after: { kind: kind, value: value.to_f, amount_minor: d.amount_minor, reason: d.reason }, approved_by: approver&.user)
        render json: OrderSerializers.full(order.reload)
      end

      def remove_discount
        require_permission!("orders.create")
        order = Order.includes(items: :modifiers).find(params[:id])
        d = order.discounts.find(params[:discount_id])
        d.destroy!
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        render json: OrderSerializers.full(order.reload)
      end

      private

      # Lines arrive as nested parameters; the builder works on plain hashes.
      def lines_param
        return nil unless params[:lines].is_a?(Array) || params[:lines].is_a?(ActionController::Parameters)
        raw = params[:lines].respond_to?(:to_unsafe_h) ? params[:lines].to_unsafe_h.values : params[:lines]
        raw.map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h : l.to_h }
      end

      def only_own?
        !current_membership.can?("reports.view_all") && !current_membership.can?("reports.view_branch") && !current_membership.can?("orders.create")
      end

      def order_attrs
        attrs = params.permit(:id, :order_type, :source, :table_id, :guest_name, :covers, :customer_id, :address_id, :notes, :client_created_at, :till_serial, :is_staff_meal, :staff_meal_reason, :delivery_charge_minor, :scheduled_for).to_h.symbolize_keys
        attrs[:is_staff_meal] = ActiveModel::Type::Boolean.new.cast(attrs[:is_staff_meal]) if attrs.key?(:is_staff_meal)
        attrs[:order_type] ||= current_business.setting("default_order_type") if action_name == "create"
        attrs
      end

      # A manager PIN sent with the request unlocks every permission that manager holds, for this request only.
      def collect_approvals
        return {} if params[:approver_pin].blank?
        approver = Auth::PinApproval.find_approver(pin: params[:approver_pin], permission: "app.pos", exclude_membership: current_membership)
        raise Api::Errors::Forbidden.new("approval.invalid", "Manager PIN is wrong") unless approver
        approver.permission_codes.index_with { approver }
      end
    end
  end
end

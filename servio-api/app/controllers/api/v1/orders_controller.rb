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
        # SPEC filters: status accepts the SPEC names (pending, preparing, ready, dispatched, completed, cancelled) or open;
        # payment_status the SPEC names (paid, pending, unpaid, account, complimentary); payment_method; a date range.
        scope = scope.where(status: Orders::SpecStatus.internal_for(params[:status])) if params[:status].present?
        scope = Orders::SpecStatus.payment_scope(scope, params[:payment_status]) if params[:payment_status].present?
        scope = scope.where(id: Payment.where(status: "captured", method_code: params[:payment_method]).select(:order_id)) if params[:payment_method].present?
        if params[:from].present? || params[:to].present?
          scope = scope.unscope(where: :business_day).where(business_day: (params[:from].presence || "2000-01-01")..(params[:to].presence || "2100-01-01"))
        end
        %i[order_type source customer_id rider_id table_id].each { |f| scope = scope.where(f => params[f]) if params[f].present? }
        scope = scope.where(taken_by_membership_id: current_membership.id) if only_own?
        if params[:q].present?
          q = params[:q].to_s.strip
          scope = q.match?(/\A#?\d+\z/) ? scope.where(serial: q.delete("#").to_i) : scope.where("orders.till_serial ILIKE :q OR orders.guest_name ILIKE :q OR orders.notes ILIKE :q", q: "%#{q}%")
        end
        if params[:sort].present? && params[:sort] != "newest"
          # SPEC sorts other than newest use page and limit rather than a cursor.
          order_by = { "oldest" => "orders.created_at ASC", "serial_asc" => "orders.serial ASC NULLS LAST", "serial_desc" => "orders.serial DESC NULLS LAST",
                       "amount_desc" => "orders.total_minor DESC", "amount_asc" => "orders.total_minor ASC" }.fetch(params[:sort]) { raise Api::Errors::BadRequest.new("sort.unknown", "Unknown sort #{params[:sort]}") }
          limit = [[params[:limit].to_i, 1].max, 200].min
          limit = 50 if params[:limit].blank?
          page = [params[:page].to_i, 1].max
          rows = scope.reorder(Arel.sql(order_by)).offset((page - 1) * limit).limit(limit + 1).to_a
          more = rows.size > limit
          return render json: { data: rows.first(limit).map { |o| OrderSerializers.summary(o) }, next_cursor: nil, next_page: more ? page + 1 : nil }
        end
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |o| OrderSerializers.summary(o) }
      end

      # GET /orders/pending  SPEC Pending Orders: orders left open across days, with tiles and a calendar
      def pending
        require_permission!("orders.create", "reports.view_all", "reports.view_branch", "ORDERS")
        today = current_branch.business_day_for(Time.current)
        scope = Order.open.where(branch_id: current_branch.id).where.not(status: "draft")
        by_day = scope.group(:business_day).count
        tiles = { today: by_day[today].to_i, yesterday: by_day[today - 1].to_i, last_30_days: by_day.select { |d, _| d >= today - 29 }.values.sum,
                  previous_days: by_day.reject { |d, _| d == today }.values.sum, all_time: by_day.values.sum, oldest_day: by_day.keys.min }
        list = params[:business_day].present? ? scope.where(business_day: params[:business_day]) : scope
        rows, cursor = paginate(list.includes(:dining_table, :items))
        render json: { tiles: tiles, calendar: by_day.sort.map { |d, n| { day: d, count: n } }, data: rows.map { |o| OrderSerializers.summary(o) }, next_cursor: cursor }
      end

      # POST /orders/bulk_complete  business_day?  SPEC Mark All Completed: every open, paid order of the day completes
      def bulk_complete
        require_permission!("COMPLETE_ORDER", "orders.create")
        day = params[:business_day].presence || current_branch.business_day_for(Time.current)
        scope = Order.open.where(branch_id: current_branch.id, business_day: day).where.not(status: %w[draft held])
        done, skipped = 0, 0
        scope.find_each do |o|
          if o.payment_status == "paid" || o.total_minor.zero?
            Orders::Transitions.close!(o, actor: current_membership, device: current_device)
            done += 1
          else
            skipped += 1
          end
        end
        audit!("bulk_update", table_name: "orders", after: { business_day: day, completed: done, skipped_unpaid: skipped })
        render json: { completed: done, skipped_unpaid: skipped, business_day: day }
      end

      # POST /orders/sync_complimentary  SPEC Sync Complimentary: complimentary orders left with a due amount are settled at zero
      def sync_complimentary
        require_permission!("COMPLIMENTARY_ORDER", "orders.staff_meal")
        fixed = 0
        Order.where(branch_id: current_branch.id, is_staff_meal: true).where.not(payment_status: "paid").where.not(status: %w[voided refunded]).find_each do |o|
          Orders::Pricing.recompute!(o) if Orders::Pricing.respond_to?(:recompute!)
          next unless o.total_minor.zero?
          o.update!(payment_status: "paid")
          Orders::Transitions.mark_paid!(o, actor: current_membership, device: current_device) unless o.completed?
          fixed += 1
        end
        render json: { synced: fixed }
      end

      # POST /orders/:id/reopen  pin? approver_pin?  SPEC reopen flow
      def reopen
        require_permission!("REOPEN_ORDER", "orders.refund")
        order = Order.find(params[:id])
        day_lock_guard!(order.business_day)
        order = Orders::Transitions.reopen!(order, actor: current_membership, device: current_device)
        audit!("update", record: order, after: { reopened: true, reopen_count: order.reopen_count })
        render json: OrderSerializers.full(order.reload)
      end

      # POST /orders/:id/complete  SPEC COMPLETE_ORDER; unpaid completes only through Direct Unpaid Orders
      def complete
        require_permission!("COMPLETE_ORDER", "orders.create")
        order = Order.includes(:items).find(params[:id])
        raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.open? && order.sent?
        allow_unpaid = current_business.setting("pos.order_behavior.direct_unpaid_orders") && (current_membership.staff_type == "admin" || current_membership.can?("PLACE_UNPAID_DIRECT"))
        order = Orders::Transitions.close!(order, actor: current_membership, device: current_device, allow_unpaid: allow_unpaid)
        render json: OrderSerializers.full(order.reload)
      end

      # GET /orders/:id/cost_analysis  SPEC Cost Analysis tab: revenue, COGS, profit and margin, itemised by ingredient
      def cost_analysis
        require_permission!("reports.view_all", "reports.view_branch", "finance.view", "ORDERS")
        order = Order.includes(:items).find(params[:id])
        entries = StockLedgerEntry.where(ref_table: "orders", ref_id: order.id, reversed_by_entry_id: nil, reverses_entry_id: nil).includes(stock_item: :base_unit)
        ingredients = entries.map { |e| { item: e.stock_item.name, quantity: e.quantity.abs.to_s("F"), unit: e.stock_item.base_unit.code, cost_minor: (e.quantity.abs * e.unit_cost_minor.to_i).round, line_id: e.ref_line_id, kind: e.kind } }
        cogs = ingredients.sum { |i| i[:cost_minor] }
        cogs = order.active_items.sum { |i| i.recipe_cost_minor_snapshot.to_i } if cogs.zero?
        labour = defined?(Overhead) && Overhead.respond_to?(:per_order_minor) ? Overhead.per_order_minor(current_branch, order.business_day) : 0
        revenue = order.total_minor - order.tax_minor
        profit = revenue - cogs - labour
        render json: { order_id: order.id, revenue_minor: revenue, cogs_minor: cogs, labour_minor: labour, profit_minor: profit,
                       margin_percent: revenue.positive? ? (profit * 100.0 / revenue).round(1) : nil, ingredients: ingredients,
                       items: order.active_items.map { |i| { id: i.id, name: i.name_snapshot, quantity: i.quantity.to_s("F"), revenue_minor: i.line_total_minor, cost_minor: i.recipe_cost_minor_snapshot.to_i } } }
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
        Orders::Transitions.place!(order, actor: current_membership, device: current_device) if ActiveModel::Type::Boolean.new.cast(params[:place]) || ActiveModel::Type::Boolean.new.cast(params[:complete])
        if ActiveModel::Type::Boolean.new.cast(params[:complete])
          # SPEC PLACE_AND_COMPLETE_ORDER
          require_permission!("PLACE_AND_COMPLETE_ORDER", "orders.create")
          allow_unpaid = current_business.setting("pos.order_behavior.direct_unpaid_orders") && (current_membership.staff_type == "admin" || current_membership.can?("PLACE_UNPAID_DIRECT"))
          Orders::Transitions.close!(order.reload, actor: current_membership, device: current_device, allow_unpaid: allow_unpaid)
        end
        render json: OrderSerializers.full(order.reload), status: :created
      end

      # POST /orders/:id/tax_choice { tax_rate_id } or { none: true }  (SPEC: No Tax / 16% choice on a linked account)
      def tax_choice
        require_permission!("orders.create")
        order = Order.includes(:items).find(params[:id])
        if ActiveModel::Type::Boolean.new.cast(params[:none])
          Orders::Builder.apply_tax_choice!(order, none: true)
        else
          Orders::Builder.apply_tax_choice!(order, tax_rate: TaxRate.active.find(params.require(:tax_rate_id)))
        end
        render json: OrderSerializers.full(order.reload)
      end

      # PATCH /orders/:id  same payload as create (lines replace the current lines; omit lines to leave them)
      def update
        require_permission!("orders.create")
        order = Order.includes(items: :modifiers).find(params[:id])
        approvals = collect_approvals
        require_order_update_pin!(order) if order.reopened?
        before_items = Orders::Story.snapshot(order)
        amount_before = order.total_minor
        builder = Orders::Builder.new(order, actor: current_membership, device: current_device, branch: current_branch)
        builder.update!(attrs: order_attrs.except(:id, :is_staff_meal, :staff_meal_reason), lines: lines_param, approvals: approvals)
        Orders::Transitions.after_edit!(order, added: builder.added, removed: builder.removed)
        if order.sent?
          diff = Orders::Story.diff(before_items, Orders::Story.snapshot(order.reload))
          unless Orders::Story.empty_diff?(diff) && amount_before == order.total_minor
            order.increment!(:edit_count)
            Orders::Story.record!(order, "edited", actor: current_membership, device: current_device, diff: diff, amount_before: amount_before, amount_after: order.total_minor)
          end
        end
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

      # POST /orders/:id/discounts  kind (percent|fixed|promotion), value, reason, order_item_id?, coupon_code?, voucher_code?, approver_pin?
      def add_discount
        require_permission!("orders.create", "discounts.apply")
        order = Order.includes(items: :modifiers).find(params[:id])
        raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
        if params[:voucher_code].present?
          # SPEC: a voucher's value was fixed when the batch was created, so it never counts against the cashier's limit.
          Marketing::Vouchers.redeem!(order, code: params[:voucher_code], actor: current_membership)
          return render json: OrderSerializers.full(order.reload)
        end
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
        Marketing::Vouchers.release!(d) if d.kind == "voucher"
        d.destroy!
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        render json: OrderSerializers.full(order.reload)
      end

      private

      # SPEC REQUIRE_PIN_FOR_ORDER_UPDATE: a restriction that demands the order-update PIN (the user's own PIN, or a
      # manager's PIN) before a reopened order is saved.
      def require_order_update_pin!(order)
        return unless current_membership.can?("REQUIRE_PIN_FOR_ORDER_UPDATE")
        pin = params[:pin].to_s
        return if pin.present? && current_membership.authenticate_pin(pin)
        approver = Auth::PinApproval.find_approver(pin: params[:approver_pin], permission: "REOPEN_ORDER", exclude_membership: current_membership)
        raise Api::Errors::Forbidden.new("pin.required", "The order-update PIN is required to save a reopened order") unless approver
        audit!("approve", record: order, approved_by: approver.user, after: { reopened_order_update: true })
      end

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
        attrs = params.permit(:id, :order_type, :source, :table_id, :guest_name, :covers, :customer_id, :address_id, :notes, :client_created_at, :till_serial, :is_staff_meal, :staff_meal_reason, :delivery_charge_minor, :delivery_charge_percent, :service_charge_percent, :service_charge_fixed_minor, :scheduled_for).to_h.symbolize_keys
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

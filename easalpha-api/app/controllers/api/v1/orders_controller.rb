module Api
  module V1
    class OrdersController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!, except: %i[index show summary]

      # GET /orders?business_day=&status=&order_type=&source=&payment_status=&q=&open=true
      def index
        require_permission!("orders.create", "reports.view_all", "reports.view_branch", "reports.view_own", "kitchen.view")
        scope = Order.includes(:dining_table, :items, :customer).where(branch_id: current_branch.id)
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
          # A receipt number (yymmdd-BRANCH-serial, the barcode on the receipt) matches exactly, whatever day it is from:
          # an equality, so a _ or % in it is a character, not a wildcard (R14). The branch part may be any code a
          # branch was given before codes were limited to A-Z and 0-9 (R15), a space included.
          scope = if q.match?(/\A#?\d+\z/) then scope.where(serial: q.delete("#").to_i)
          elsif q.match?(/\A\d{6}-.+-\d+\z/) then scope.unscope(where: :business_day).where("lower(orders.receipt_number) = lower(?)", q)
          else scope.where("orders.till_serial ILIKE :q OR orders.guest_name ILIKE :q OR orders.notes ILIKE :q", q: ApplicationRecord.contains_pattern(q))
          end
        end
        if params[:sort].present? && params[:sort] != "newest"
          # SPEC sorts other than newest use page and limit rather than a cursor.
          order_by = { "oldest" => "orders.created_at ASC", "serial_asc" => "orders.serial ASC NULLS LAST", "serial_desc" => "orders.serial DESC NULLS LAST",
                       "amount_desc" => "orders.total_minor DESC", "amount_asc" => "orders.total_minor ASC" }.fetch(params[:sort]) { raise Api::Errors::BadRequest.new("sort.unknown", "Unknown sort #{params[:sort]}") }
          limit = [ [ params[:limit].to_i, 1 ].max, 200 ].min
          limit = 50 if params[:limit].blank?
          page = [ params[:page].to_i, 1 ].max
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
        rows, cursor = paginate(list.includes(:dining_table, :items, :customer))
        render json: { tiles: tiles, calendar: by_day.sort.map { |d, n| { day: d, count: n } }, data: rows.map { |o| OrderSerializers.summary(o) }, next_cursor: cursor }
      end

      # POST /orders/bulk_complete  business_day?  SPEC Mark All Completed: every open, paid order of the day completes
      def bulk_complete
        require_permission!("COMPLETE_ORDER", "orders.create")
        day = params[:business_day].presence || current_branch.business_day_for(Time.current)
        scope = Order.open.where(branch_id: current_branch.id, business_day: day).where.not(status: %w[draft held])
        done, skipped, overpaid = 0, 0, 0
        scope.find_each do |o|
          if o.paid_minor > o.total_minor
            overpaid += 1 # its excess is refunded first (order.overpaid), so it waits rather than stopping the rest
          elsif o.payment_status == "paid" || o.total_minor.zero?
            Orders::Transitions.close!(o, actor: current_membership, device: current_device)
            done += 1
          else
            skipped += 1
          end
        end
        audit!("bulk_update", table_name: "orders", after: { business_day: day, completed: done, skipped_unpaid: skipped, skipped_overpaid: overpaid })
        render json: { completed: done, skipped_unpaid: skipped, skipped_overpaid: overpaid, business_day: day }
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

      # POST /orders/:id/reopen  approver_pin?, approval_codes?  SPEC reopen flow
      def reopen
        require_permission!("REOPEN_ORDER", "orders.refund", "orders.create")
        order = Order.find(params[:id])
        day_lock_guard!(order.business_day)
        # A till user who may not reopen asks a manager, whose PIN approves REOPEN_ORDER as the dialog names it (QA T11:
        # the cashier was refused outright, PIN or not).
        approver = current_membership.can?("orders.refund") ? current_membership : require_approval!("REOPEN_ORDER")
        order = Orders::Transitions.reopen!(order, actor: current_membership, device: current_device)
        audit!("update", record: order, after: { reopened: true, reopen_count: order.reopen_count }, approved_by: approver == current_membership ? nil : approver.user)
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
          # A repeated create answers with the order it made. A finished one is not that: the till still holds a sale it
          # completed (its receipt left on screen), and lines added to it would be dropped without a word (QA T9).
          unless existing.open?
            raise Api::Errors::Conflict.new("order.closed", "#{existing.label} is already #{existing.status}: start a new order", details: { order: OrderSerializers.full(existing) })
          end
          return render json: OrderSerializers.full(existing), status: :ok
        end
        approvals = collect_approvals
        attrs = order_attrs
        if attrs[:is_staff_meal]
          attrs[:staff_meal_approved_by_id] = (approvals["orders.staff_meal"] || require_approval!("orders.staff_meal")).id
        end
        # The till's clock dates the order, within a week back and an hour ahead (Orders::ClientTime); the day lock is checked on the day it lands.
        attrs[:client_created_at] = Orders::ClientTime.clamp(attrs[:client_created_at], record_id: attrs[:id].presence) if attrs.key?(:client_created_at)
        day_lock_guard!(current_branch.business_day_for(attrs[:client_created_at] || Time.current))
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
        # The till's clock dates an order once, at create, inside the Orders::ClientTime window; every save sends that
        # time back. An update never re-dates it, so it cannot move the order a year back and buy a regular-discount
        # tier (review orders-money#7), nor clamp a long-open order's time again on each save.
        builder.update!(attrs: staff_meal_change(order, order_attrs.except(:id, :client_created_at), approvals), lines: lines_param, approvals: approvals)
        Orders::Transitions.after_edit!(order, added: builder.added, removed: builder.removed)
        if order.sent?
          diff = Orders::Story.diff(before_items, Orders::Story.snapshot(order.reload))
          unless Orders::Story.empty_diff?(diff) && amount_before == order.total_minor
            order.increment!(:edit_count)
            Orders::Story.record!(order, "edited", actor: current_membership, device: current_device, diff: diff, amount_before: amount_before, amount_after: order.total_minor)
          end
        end
        audit!("update", record: order, after: { total_minor: order.total_minor, added: builder.added.size, removed: builder.removed.size, staff_meal: order.is_staff_meal })
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
        day_lock_guard!(order.business_day) # an open order left on a day locked by force changes no more, as in Builder#update!
        # Review 3.9: every discount change is logged with the order's discount and total before and after.
        before = { discount_minor: order.discount_minor, total_minor: order.total_minor }
        if params[:voucher_code].present?
          # SPEC: a voucher's value was fixed when the batch was created, so it never counts against the cashier's limit.
          Marketing::Vouchers.redeem!(order, code: params[:voucher_code], actor: current_membership)
          order.reload
          audit!("discount", record: order, before: before, after: { kind: "voucher", code: params[:voucher_code].to_s.upcase, discount_minor: order.discount_minor, total_minor: order.total_minor })
          return render json: OrderSerializers.full(order)
        end
        kind, value, promotion = params[:kind].to_s, params[:value].to_d, nil
        if params[:coupon_code].present?
          promotion = Promotion.active.find_by(coupon_code: params[:coupon_code].to_s.strip.upcase)
          raise Api::Errors::NotFound.new("coupon.invalid", "This coupon does not exist") unless promotion
          raise Api::Errors::Conflict.new("coupon.unavailable", "This coupon is not valid right now") unless promotion.available_at?(Time.current, zone: current_business.time_zone)
          raise Api::Errors::Conflict.new("discount.applied", "#{promotion.coupon_code} is already applied to this order") if order.discounts.exists?(promotion_id: promotion.id)
          check_coupon!(order, promotion)
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
        # A coupon's own targets choose its lines, never a line the request names.
        d = order.discounts.create!(kind: kind, value: value, reason: params[:reason].presence || promotion&.name, order_item_id: promotion ? nil : params[:order_item_id].presence, promotion_id: promotion&.id,
                                    applied_by_membership_id: current_membership.id, approved_by_membership_id: approver && approver != current_membership ? approver.id : nil)
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        promotion&.increment!(:units_sold)
        audit!("discount", record: order, before: before, after: { kind: kind, value: value.to_f, amount_minor: d.amount_minor, reason: d.reason, discount_minor: order.discount_minor, total_minor: order.total_minor }, approved_by: approver&.user)
        render json: OrderSerializers.full(order.reload)
      end

      def remove_discount
        require_permission!("orders.create")
        order = Order.includes(items: :modifiers).find(params[:id])
        # As for adding one: a settled sale, or one on a locked day, keeps its discounts (and its voucher stays used).
        raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
        day_lock_guard!(order.business_day)
        d = order.discounts.find(params[:discount_id])
        before = { kind: d.kind, value: d.value.to_f, amount_minor: d.amount_minor, discount_minor: order.discount_minor, total_minor: order.total_minor }
        Marketing::Vouchers.release!(d) if d.kind == "voucher"
        # A coupon taken off gives its use back, as a void does, so a one-use offer is not spent on a sale without it.
        Promotion.where(id: d.promotion_id).update_all("units_sold = GREATEST(units_sold - 1, 0)") if d.promotion_id
        d.destroy!
        Orders::Pricing.recalculate!(order.reload)
        Orders::Pricing.save_all!(order)
        audit!("discount", record: order, before: before, after: { removed: true, discount_minor: order.discount_minor, total_minor: order.total_minor })
        render json: OrderSerializers.full(order.reload)
      end

      private

      # A coupon's own rules before it goes on (QA T2). One coupon per order: a promotion has no stacking field and the
      # SPEC names none. Its minimum order is weighed against what the order comes to now, before tax (as a voucher's
      # minimum spend is), and a coupon for some products or categories needs one of them on the order. Pricing keeps
      # the same rules on every later recalculation.
      def check_coupon!(order, promotion)
        if (other = order.discounts.where.not(promotion_id: nil).first)
          applied = Promotion.find_by(id: other.promotion_id)&.coupon_code || other.reason
          raise Api::Errors::Conflict.new("coupon.one_per_order", "#{applied} is already on this order: remove it to use #{promotion.coupon_code}")
        end
        rs = ->(minor) { "Rs #{Customers::Notify.rupees(minor)}" }
        comes_to = order.subtotal_minor - order.discount_minor
        if comes_to < promotion.min_order_minor
          raise Api::Errors::Conflict.new("coupon.min_order", "#{promotion.coupon_code} needs an order of #{rs.(promotion.min_order_minor)} or more; this order comes to #{rs.(comes_to)}",
                                          details: { min_order_minor: promotion.min_order_minor, order_minor: comes_to })
        end
        return unless promotion.targeted? && order.active_items.none? { |i| promotion.covers?(i) }
        raise Api::Errors::Conflict.new("coupon.no_items", "#{promotion.coupon_code} is for #{promotion.target_names} only: add it to the order first")
      end

      # SPEC REQUIRE_PIN_FOR_ORDER_UPDATE: a restriction that demands the order-update PIN (the user's own PIN, or a
      # manager's PIN) before a reopened order is saved.
      def require_order_update_pin!(order)
        return unless current_membership.can?("REQUIRE_PIN_FOR_ORDER_UPDATE")
        pin = params[:pin].to_s
        return if pin.present? && current_membership.authenticate_pin(pin)
        codes = approval_codes
        approver = Auth::PinApproval.find_approver(pin: params[:approver_pin], permission: "REOPEN_ORDER", exclude_membership: current_membership) if codes.nil? || codes.include?("REOPEN_ORDER")
        raise Api::Errors.approval_required([ "REOPEN_ORDER" ], "The order-update PIN is required to save a reopened order", code: "pin.required") unless approver
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

      # The staff-meal flag on an existing order (the till sends it on every update). Switching it on needs
      # orders.staff_meal, the role's own or a manager's PIN, and records the approver; switching it off charges the
      # order normally and needs nothing more; an update without the flag leaves it as it is.
      def staff_meal_change(order, attrs, approvals)
        return attrs.except(:is_staff_meal, :staff_meal_reason) unless attrs.key?(:is_staff_meal)
        if attrs[:is_staff_meal]
          attrs[:staff_meal_approved_by_id] = (approvals["orders.staff_meal"] || require_approval!("orders.staff_meal")).id unless order.is_staff_meal
          attrs[:staff_meal_reason] = order.staff_meal_reason if attrs[:staff_meal_reason].blank?
        else
          attrs[:staff_meal_reason] = nil
          attrs[:staff_meal_approved_by_id] = nil
        end
        attrs
      end

      # A manager PIN sent with the request grants, for this request only, what the till's PIN dialog showed the
      # manager (approval_codes, from the details.permissions of the approval.required it answered) and that the
      # manager holds; anything else still asks. Without approval_codes (a till from before 6 Nov 2026) the PIN
      # unlocks every permission the manager holds, as it did, for one release, and the log says so (R6).
      def collect_approvals
        return {} if params[:approver_pin].blank?
        approver = Auth::PinApproval.find_approver(pin: params[:approver_pin], permission: "app.pos", exclude_membership: current_membership)
        raise Api::Errors::Forbidden.new("approval.invalid", "Manager PIN is wrong") unless approver
        codes = approval_codes
        return (codes & approver.permission_codes).index_with { approver } if codes
        log_legacy_approval("grants every permission of membership #{approver.id}")
        approver.permission_codes.index_with { approver }
      end
    end
  end
end

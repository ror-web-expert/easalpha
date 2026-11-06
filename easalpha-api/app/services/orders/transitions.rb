module Orders
  # Every status change goes through here so the serial, events, kitchen tickets and broadcasts stay consistent.
  module Transitions
    module_function

    def place!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.empty", "Add at least one item before sending") if order.active_items.empty?
      raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.status.in?(%w[draft held])
      require_customer!(order)
      Order.transaction do
        order.business_day ||= order.branch.business_day_for(order.client_created_at || Time.current)
        order.serial ||= OrderSerial.next!(branch_id: order.branch_id, business_day: order.business_day)
        order.placed_at ||= Time.current
        change!(order, "placed", actor: actor, device: device)
        order.items.each { |i| i.update!(status: "sent", sent_at: Time.current) if i.status == "pending" }
        # A canteen meal is served from the day's plan at the counter, not cooked to order: no kitchen ticket.
        Kitchen::Tickets.create_for!(order, kind: "new", items: order.active_items) unless order.source == "kiosk" && MealClaim.exists?(order_id: order.id)
        Story.record!(order, "punched", actor: actor, device: device, amount_after: order.total_minor)
        SetupChecklistItem.complete!("first_order")
      end
      # SPEC: stock is deducted once, when the order is completed (see deduct_on_completion!), not here.
      Deliveries::Manager.ensure_for!(order)
      Realtime.order_changed(order)
      order
    end

    # The till deducts once, at completion. A lost call is caught by Stock::SafetyNet; a repeat can never deduct twice.
    def deduct_on_completion!(order, actor:)
      return if order.stock_deducted_at
      Stock::Deduction.deduct!(order, actor: actor)
    end

    # After a placed order is edited: new items get a ticket, removed items a cancelled ticket.
    def after_edit!(order, added:, removed:)
      return unless order.sent?
      added = added.reject(&:cancelled?)
      added.each { |i| i.update!(status: "sent", sent_at: Time.current) if i.status == "pending" }
      Kitchen::Tickets.create_for!(order, kind: "changed", items: added) if added.any?
      Kitchen::Tickets.create_for!(order, kind: "cancelled", items: removed) if removed.any?
      # Once the order has taken stock (stamped, or rows left after a re-deduct failed), every line follows the edit:
      # raised, lowered, added or removed. packaging: false keeps the order-level packaging rules (already charged).
      Stock::Deduction.deduct!(order, actor: nil, packaging: false) if order.stock_deducted_at || Stock::Deduction.moved?(order)
      Realtime.order_changed(order)
    end

    def start!(order, actor: nil, device: nil)
      return order unless order.status == "placed"
      change!(order, "preparing", actor: actor, device: device)
      Realtime.order_changed(order)
      order
    end

    def ready!(order, actor: nil, device: nil)
      return kitchen_done!(order) if order.status.in?(Order::AFTER_KITCHEN_STATUSES)
      raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.status.in?(%w[placed preparing])
      Order.transaction do
        order.items.where(status: %w[sent preparing]).update_all(status: "ready", bumped_at: Time.current)
        order.ready_at = Time.current
        change!(order, "ready", actor: actor, device: device)
      end
      Realtime.order_changed(order)
      Realtime.token_ready(order)
      order
    end

    # The kitchen finished an order already past it: paid before it was cooked (a takeaway paid at once), or served or
    # reopened with a line added. Its lines are ready and it leaves the kitchen display; its status stays (QA F2). A
    # second bump changes nothing.
    def kitchen_done!(order)
      cooking = order.items.where(status: %w[sent preparing])
      return order if order.ready_at && !cooking.exists?
      Order.transaction do
        cooking.update_all(status: "ready", bumped_at: Time.current)
        order.update!(ready_at: order.ready_at || Time.current)
      end
      Realtime.order_changed(order)
      Realtime.token_ready(order)
      order
    end

    # Statuses a kitchen bump moves on: cooking, or past the kitchen with lines still cooking (kitchen_done!).
    BUMPABLE = (%w[placed preparing] + Order::AFTER_KITCHEN_STATUSES).freeze

    # A kitchen screen's "Bump order" (F10). From one station's screen it marks that station's lines ready, not every
    # station's; the order is ready once every station's lines are. Lines that belong to no station show on no station's
    # screen, so they go ready with the last station. Without a station (the all-stations screen) the whole order is
    # ready, as before. On a ready order only a line added since it was ready is left to bump, and the order stays as
    # it is, so a second press changes nothing.
    def bump!(order, station_id: nil, actor: nil, device: nil)
      cooking = order.items.where(status: %w[sent preparing])
      cooking = cooking.where(station_id: station_id) if station_id.present?
      if order.status == "ready"
        Realtime.kitchen_changed(order.branch_id, order.business_id) if cooking.update_all(status: "ready", bumped_at: Time.current).positive?
        return order
      end
      return ready!(order, actor: actor, device: device) if station_id.blank?
      raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.status.in?(BUMPABLE)
      cooking.update_all(status: "ready", bumped_at: Time.current)
      ready_when_stations_done!(order, actor: actor, device: device)
    end

    # Ready once every line the kitchen has (sent, not waiting for a cashier's accept) is ready at its station; with
    # no stations at all, once every line is. An order past the kitchen keeps its status (kitchen_done!). Otherwise the
    # order is in preparation and the screens refresh.
    def ready_when_stations_done!(order, actor: nil, device: nil)
      cooking = order.items.reload.reject { |i| i.status.in?(%w[cancelled pending]) }
      owned = cooking.select(&:station_id)
      done = (owned.any? ? owned : cooking).all? { |i| i.status.in?(%w[ready served]) }
      return ready!(order.reload, actor: actor, device: device) if done && order.status.in?(BUMPABLE)
      start!(order, actor: actor, device: device)
      Realtime.kitchen_changed(order.branch_id, order.business_id)
      order
    end

    def serve!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.status.in?(%w[placed preparing ready])
      to = order.order_type == "delivery" ? "dispatched" : "served"
      order.served_at = Time.current
      order.items.where(status: %w[sent preparing ready]).update_all(status: "served")
      change!(order, to, actor: actor, device: device)
      Realtime.order_changed(order)
      order
    end

    def hold!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.status", "Only a draft can be held") unless order.status == "draft"
      change!(order, "held", actor: actor, device: device)
    end

    def resume!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.status", "Order is not held") unless order.status == "held"
      change!(order, "draft", actor: actor, device: device)
    end

    def void!(order, reason:, actor:, approver:, device: nil)
      stock_action = nil
      Order.transaction do
        # Row lock first: a second void of the same order (another till, a request sent again, the sync queue) waits
        # here, then finds it voided and is refused, so the vouchers, coupon uses and points it took go back once.
        order.lock!
        # Money the order still holds is refunded first; an open order whose part payment went back holds none (ledger#0).
        raise Api::Errors::Conflict.new("order.paid", "A paid order is refunded, not voided") if order.status.in?(%w[paid closed]) || (order.paid_minor.positive? && Payments::Refunder.held_minor(order).positive?)
        raise Api::Errors::Conflict.new("order.status", "Order is already #{order.status}") if order.status.in?(%w[voided refunded])
        raise Api::Errors::Conflict.new("day.locked", "#{order.business_day} is locked. A manager must reopen it first.") if order.business_day && DayClose.locked?(order.branch_id, order.business_day)
        stock_action = order.sent? ? (order.status.in?(%w[ready served dispatched]) ? "waste" : "returned") : "none"
        Void.create!(order: order, reason: reason, stock_action: stock_action, amount_minor: order.total_minor, by_membership_id: actor&.id, approved_by_membership_id: approver&.id, voided_at: Time.current)
        order.voided_at = Time.current
        order.void_reason = reason
        order.void_approved_by_id = approver&.id
        active = order.active_items
        order.items.where.not(status: "cancelled").update_all(status: "cancelled", cancelled_reason: "void: #{reason}")
        change!(order, "voided", actor: actor, device: device, reason: reason)
        Story.record!(order, "cancelled", actor: actor, device: device, amount_before: order.total_minor, amount_after: 0, note: reason)
        Kitchen::Tickets.create_for!(order, kind: "cancelled", items: active) if order.sent?
        order.dining_table&.release! if order.table_id
        release_consumed!(order)
        AuditLog.record(action: "void", record: order, after: { reason: reason, amount_minor: order.total_minor, stock_action: stock_action }, approved_by: approver&.user)
      end
      if order.stock_deducted_at
        if stock_action == "returned" && InventorySetting.current.return_on_cancel
          Stock::Deduction.return!(order, actor: actor, reason: "void")
        else
          Stock::Deduction.waste!(order, reason: "void after cooking: #{reason}")
        end
      end
      Deliveries::Manager.failed_by_void!(order)
      Alerts.big_void(order, reason: reason, approver: approver)
      Realtime.order_changed(order)
      order
    end

    # A voided order consumed nothing: each voucher it redeemed is given back, each coupon use counted against a use
    # limit (a one-use birthday offer) is returned, and the loyalty points spent on it go back to whoever spent them.
    def release_consumed!(order)
      order.discounts.each { |d| Marketing::Vouchers.release!(d) if d.kind == "voucher" }
      DiscountApplied.where(order_id: order.id).where.not(promotion_id: nil).group(:promotion_id).count.each do |promotion_id, uses|
        Promotion.where(id: promotion_id).update_all([ "units_sold = GREATEST(units_sold - ?, 0)", uses ])
      end
      Loyalty.refund_on_void!(order)
    end

    def mark_paid!(order, actor:, device: nil)
      order.paid_at ||= Time.current
      number!(order)
      order.completed_by_membership_id = actor&.id
      # Paying is not cooking (QA F2; the SPEC keeps the payment status apart from the order's): lines the kitchen has
      # not finished stay on its display until it bumps them.
      counter_served!(order)
      change!(order, "paid", actor: actor, device: device)
      Story.record!(order, "completed", actor: actor, device: device, amount_after: order.total_minor)
      deduct_on_completion!(order, actor: actor)
      order.dining_table&.release! if order.table_id
      Realtime.order_changed(order)
      order
    end

    # Completing (SPEC COMPLETE_ORDER). An unpaid order completes only through Direct Unpaid Orders; a reopened order
    # always goes back through the payment screen, so it must be paid again first.
    def close!(order, actor:, device: nil, allow_unpaid: false)
      paid = order.payment_status == "paid" || order.total_minor.zero?
      raise Api::Errors::Conflict.new("order.unpaid", "Order must be paid before closing") unless paid || (allow_unpaid && !order.reopened_since_payment?)
      refuse_overpaid!(order)
      was_completed = order.completed?
      order.closed_at = Time.current
      order.completed_by_membership_id = actor&.id
      order.unpaid_direct = true unless paid
      # Settled without a payment (a staff meal, a zero total): it still gets its receipt number and paid time, so the
      # receipt is a RECEIPT with its barcode and the hourly sales find it (review orders-money#6, QA T13).
      if paid
        order.paid_at ||= Time.current
        number!(order)
      end
      counter_served!(order) # a free canteen meal is completed at the counter without a payment
      change!(order, "closed", actor: actor, device: device)
      Story.record!(order, "completed", actor: actor, device: device, amount_after: order.total_minor, note: paid ? nil : "placed unpaid") unless was_completed
      deduct_on_completion!(order, actor: actor)
      order.dining_table&.release! if order.table_id
      Realtime.order_changed(order)
      order
    end

    # More was taken than the order now costs (a reopened order whose total fell): completed like this, the difference
    # would stay in the takings with nothing recorded against it. It is refunded first; the open order takes that refund.
    def refuse_overpaid!(order)
      excess = order.paid_minor - order.total_minor
      return unless excess.positive?
      rs = ->(minor) { "Rs #{Customers::Notify.rupees(minor)}" }
      raise Api::Errors::Conflict.new("order.overpaid", "#{order.label} was paid #{rs.(order.paid_minor)} against a total of #{rs.(order.total_minor)}. Refund #{rs.(excess)} before completing it.",
                                      details: { refund_minor: excess, paid_minor: order.paid_minor, total_minor: order.total_minor })
    end

    # SPEC reopen: a completed order comes back for editing. It stays open (served, a delivery too: its ride is over,
    # so it must not show as out with a rider again) until it goes through the payment screen and is completed
    # again; the story counts every reopen.
    def reopen!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.status", "Only a completed order can be reopened; this one is #{order.status}") unless order.completed?
      raise Api::Errors::Conflict.new("order.empty", "This order has no items") if order.active_items.empty?
      to = "served"
      Order.transaction do
        order.reopened_at = Time.current
        order.reopen_count += 1
        order.closed_at = nil
        order.unpaid_direct = false
        change!(order, to, actor: actor, device: device, reason: "reopened")
        Story.record!(order, "reopened", actor: actor, device: device, amount_before: order.total_minor, amount_after: order.total_minor)
      end
      Realtime.order_changed(order)
      order
    end

    # Reopened orders always use the payment screen (SPEC): an order reopened after it was paid is not "paid" again
    # until a new payment or a zero balance is recorded.
    def require_customer!(order)
      return if order.customer_id.present?
      return unless order.source.in?(%w[till app]) # web, QR and aggregator orders carry their own customer details
      required = order.business.setting("pos.customer_required.#{order.order_type}")
      raise Api::Errors::Unprocessable.new("customer.required", "A customer must be selected on #{order.order_type.tr('_', '-')} orders") if required
    end

    # A canteen meal is handed over at the counter from the day's plan, never cooked to order: once it is paid or
    # completed its lines are served, so it never waits on the kitchen display.
    def counter_served!(order)
      order.items.where(status: %w[sent preparing ready]).update_all(status: "served") if order.source == "kiosk"
    end

    # The receipt number: business day, branch code and the day's serial (the barcode on the receipt).
    def number!(order)
      order.receipt_number ||= "#{order.business_day&.strftime('%y%m%d')}-#{order.branch.code}-#{order.serial}"
    end

    def change!(order, to, actor:, device:, reason: nil)
      from = order.status
      order.status = to
      order.save!
      OrderStatusEvent.create!(order: order, from_status: from, to_status: to, membership_id: actor&.id, device_id: device&.id, reason: reason, occurred_at: Time.current)
      order
    end
  end
end

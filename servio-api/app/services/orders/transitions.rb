module Orders
  # Every status change goes through here so the serial, events, kitchen tickets and broadcasts stay consistent.
  module Transitions
    module_function

    def place!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.empty", "Add at least one item before sending") if order.active_items.empty?
      raise Api::Errors::Conflict.new("order.status", "Order is #{order.status}") unless order.status.in?(%w[draft held])
      Order.transaction do
        order.business_day ||= order.branch.business_day_for(order.client_created_at || Time.current)
        order.serial ||= OrderSerial.next!(branch_id: order.branch_id, business_day: order.business_day)
        order.placed_at ||= Time.current
        change!(order, "placed", actor: actor, device: device)
        order.items.each { |i| i.update!(status: "sent", sent_at: Time.current) if i.status == "pending" }
        Kitchen::Tickets.create_for!(order, kind: "new", items: order.active_items)
        SetupChecklistItem.complete!("first_order")
      end
      Stock::Deduction.deduct!(order, actor: actor)
      Deliveries::Manager.ensure_for!(order)
      Realtime.order_changed(order)
      order
    end

    # After a placed order is edited: new items get a ticket, removed items a cancelled ticket.
    def after_edit!(order, added:, removed:)
      return unless order.sent?
      added = added.reject(&:cancelled?)
      added.each { |i| i.update!(status: "sent", sent_at: Time.current) if i.status == "pending" }
      Kitchen::Tickets.create_for!(order, kind: "changed", items: added) if added.any?
      Kitchen::Tickets.create_for!(order, kind: "cancelled", items: removed) if removed.any?
      Stock::Deduction.return!(order, items: removed, reason: "removed") if removed.any? && order.stock_deducted_at
      Stock::Deduction.deduct!(order, items: added, actor: nil, packaging: false) if added.any? && order.stock_deducted_at
      Realtime.order_changed(order)
    end

    def start!(order, actor: nil, device: nil)
      return order unless order.status == "placed"
      change!(order, "preparing", actor: actor, device: device)
      Realtime.order_changed(order)
      order
    end

    def ready!(order, actor: nil, device: nil)
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
      raise Api::Errors::Conflict.new("order.paid", "A paid order is refunded, not voided") if order.paid_minor.positive? || order.status.in?(%w[paid closed])
      raise Api::Errors::Conflict.new("order.status", "Order is already #{order.status}") if order.status.in?(%w[voided refunded])
      stock_action = order.sent? ? (order.status.in?(%w[ready served dispatched]) ? "waste" : "returned") : "none"
      Order.transaction do
        Void.create!(order: order, reason: reason, stock_action: stock_action, amount_minor: order.total_minor, by_membership_id: actor&.id, approved_by_membership_id: approver&.id, voided_at: Time.current)
        order.voided_at = Time.current
        order.void_reason = reason
        order.void_approved_by_id = approver&.id
        active = order.active_items
        order.items.where.not(status: "cancelled").update_all(status: "cancelled", cancelled_reason: "void: #{reason}")
        change!(order, "voided", actor: actor, device: device, reason: reason)
        Kitchen::Tickets.create_for!(order, kind: "cancelled", items: active) if order.sent?
        order.dining_table&.release! if order.table_id
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
      Loyalty.refund_on_void!(order)
      Alerts.big_void(order, reason: reason, approver: approver)
      Realtime.order_changed(order)
      order
    end

    def mark_paid!(order, actor:, device: nil)
      order.paid_at ||= Time.current
      order.completed_by_membership_id ||= actor&.id
      order.items.where(status: %w[sent preparing ready]).update_all(status: "served")
      change!(order, "paid", actor: actor, device: device)
      order.dining_table&.release! if order.table_id
      Realtime.order_changed(order)
      order
    end

    def close!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("order.unpaid", "Order must be paid before closing") unless order.payment_status == "paid" || order.total_minor.zero?
      order.closed_at = Time.current
      order.completed_by_membership_id = actor&.id
      change!(order, "closed", actor: actor, device: device)
      order.dining_table&.release! if order.table_id
      Realtime.order_changed(order)
      order
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

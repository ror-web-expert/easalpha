module Sync
  # Applies a till's offline queue in order. Every record carries the UUID the device made; repeats are duplicates, never double writes.
  # records: [{ type, id, membership_id?, payload }]
  class Push
    TYPES = %w[order order_update payment refund void shift_open shift_close cash_movement meal_claim].freeze
    CHARGE_KEYS = %i[service_charge_percent service_charge_fixed_minor delivery_charge_percent].freeze

    def initialize(device:, branch:, actor:)
      @device, @branch, @actor = device, branch, actor
    end

    def call(records)
      batch = SyncBatch.create!(branch_id: @branch.id, device_id: @device.id, direction: "push", record_count: records.size, started_at: Time.current)
      results = records.map { |r| apply(r.to_h.with_indifferent_access, batch) }
      batch.update!(accepted: results.count { |r| r[:status] == "accepted" }, duplicates: results.count { |r| r[:status] == "duplicate" }, rejected: results.count { |r| r[:status] == "rejected" }, finished_at: Time.current)
      @device.update_columns(last_sync_at: Time.current, last_seen_at: Time.current)
      { batch_id: batch.id, results: results, server_time: Time.current }
    end

    private

    def apply(record, batch)
      type, id, payload = record[:type].to_s, record[:id].to_s, (record[:payload] || {}).to_h.with_indifferent_access
      return reject(record, batch, "sync.type", "Unknown record type #{type}") unless TYPES.include?(type)
      return reject(record, batch, "sync.id", "Record id must be a UUID") unless id.match?(/\A[0-9a-f-]{36}\z/i)
      actor = actor_for(record)
      return reject(record, batch, "sync.member", "Staff member is not active at this branch") unless actor || type == "meal_claim" # a kiosk has no cashier
      status = send("apply_#{type}", id, payload, actor)
      { id: id, type: type, status: status }
    rescue Api::Errors::ApiError => e
      reject(record, batch, e.code, e.message)
    rescue ActiveRecord::RecordNotFound => e
      reject(record, batch, "not_found", e.message)
    rescue ActiveRecord::RecordNotUnique
      reject(record, batch, "sync.duplicate_id", "A record with this id already exists")
    rescue ActiveRecord::RecordInvalid => e
      reject(record, batch, "validation_failed", e.record.errors.full_messages.to_sentence)
    end

    def need(payload, key)
      payload[key].presence || raise(Api::Errors::BadRequest.new("sync.payload", "#{key} is required"))
    end

    def actor_for(record)
      return @actor if record[:membership_id].blank? || record[:membership_id] == @actor&.id
      m = Membership.includes(:role, :user).find_by(id: record[:membership_id])
      m if m && (m.active? || m.deactivated_at && record.dig(:payload, :client_created_at) && Time.iso8601(record[:payload][:client_created_at].to_s) < m.deactivated_at) && m.branch_allowed?(@branch.id)
    end

    # A manager approval made on the till names the approving member. It counts only if that member is active and
    # holds the permission; a cashier who holds it approves their own action, as online.
    def approver_for(payload, permission, actor)
      return nil if actor.can?(permission)
      id = payload[:approved_by_membership_id].presence || payload[:staff_meal_approved_by_id].presence
      m = id && Membership.includes(:role, :user).find_by(id: id)
      raise Api::Errors::Forbidden.new("approval.required", "A manager with #{permission} must approve this") unless m&.active? && m.can?(permission)
      m
    end

    def reject(record, batch, code, message)
      SyncRejection.create!(branch_id: @branch.id, device_id: @device.id, sync_batch_id: batch.id, record_type: record[:type].to_s, record_id: (record[:id].to_s.presence || SecureRandom.uuid),
                            code: code, message: message, payload: record.to_h)
      { id: record[:id], type: record[:type], status: "rejected", code: code, message: message }
    end

    # An order from the till: lines, optional payments, and the status it reached offline. Sent again (Try again on the
    # till) after its payments were refused, the order is already here: only the payments it does not have yet are
    # taken, so the sale can still be completed.
    def apply_order(id, payload, actor)
      if (existing = Order.includes(items: :modifiers).find_by(id: id))
        return apply_missing_payments(existing, payload, actor) ? "accepted" : "duplicate"
      end
      # The charges travel too: a service charge the cashier changed or removed offline (prices.override, as online)
      # must price the order here as it did on the till, or the payment no longer matches the total.
      attrs = payload.slice(:order_type, :source, :table_id, :guest_name, :covers, :customer_id, :address_id, :notes, :client_created_at, :till_serial, :is_staff_meal, :staff_meal_reason,
                            :delivery_charge_minor, *CHARGE_KEYS).to_h.symbolize_keys
      attrs[:id] = id
      attrs[:source] ||= "till"
      attrs[:is_staff_meal] = ActiveModel::Type::Boolean.new.cast(attrs[:is_staff_meal]) if attrs.key?(:is_staff_meal)
      attrs[:staff_meal_approved_by_id] = (approver_for(payload, "orders.staff_meal", actor) || actor).id if attrs[:is_staff_meal]
      day = @branch.business_day_for(attrs[:client_created_at].present? ? Time.iso8601(attrs[:client_created_at].to_s) : Time.current)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked") if DayClose.locked?(@branch.id, day)
      builder = Orders::Builder.create!(attrs, lines: Array(payload[:lines]).map(&:to_h), actor: actor, device: @device, branch: @branch, approvals: {})
      order = builder.order
      Orders::Transitions.place!(order, actor: actor, device: @device) if payload[:status].to_s != "draft" && payload[:status].present?
      if payload[:voided].present? || payload[:status].to_s == "voided"
        Orders::Transitions.void!(order, reason: payload[:void_reason].presence || "voided on till", actor: actor, approver: approver_for(payload, "orders.void", actor), device: @device)
      elsif payload[:payments].present?
        Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.open.find_by(cashier_membership_id: actor.id)).call(payments: payload[:payments], tip_minor: payload[:tip_minor].to_i, offline: true)
      end
      "accepted"
    end

    # True when the order took payments it was missing. A voided or settled order, or one whose payments are all
    # recorded, is left as it is.
    def apply_missing_payments(order, payload, actor)
      return false if payload[:voided].present? || payload[:status].to_s == "voided"
      return false unless order.status.in?(%w[draft held placed preparing ready served dispatched])
      missing = Array(payload[:payments]).map { |p| p.to_h.with_indifferent_access }.reject { |p| p[:id].present? && Payment.exists?(id: p[:id]) }
      return false if missing.empty?
      tip = order.paid_minor.zero? ? payload[:tip_minor].to_i : 0
      Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.open.find_by(cashier_membership_id: actor.id)).call(payments: missing, tip_minor: tip, offline: true)
      true
    end

    def apply_order_update(id, payload, actor)
      order = Order.includes(items: :modifiers).find(id)
      return "duplicate" if payload[:client_seq].present? && order.notes.to_s.include?("seq:#{payload[:client_seq]}")
      builder = Orders::Builder.new(order, actor: actor, device: @device, branch: @branch)
      builder.update!(attrs: payload.slice(:order_type, :table_id, :guest_name, :covers, :customer_id, :notes, :delivery_charge_minor, *CHARGE_KEYS).to_h.symbolize_keys, lines: Array(payload[:lines]).map(&:to_h), approvals: {})
      Orders::Transitions.after_edit!(order, added: builder.added, removed: builder.removed)
      "accepted"
    end

    def apply_payment(id, payload, actor)
      return "duplicate" if Payment.exists?(id: id)
      order = Order.includes(items: :modifiers).find(need(payload, :order_id))
      Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.open.find_by(cashier_membership_id: actor.id)).call(payments: [ payload.merge(id: id) ], tip_minor: payload[:tip_minor].to_i, offline: true)
      "accepted"
    end

    def apply_refund(id, payload, actor)
      return "duplicate" if Refund.exists?(id: id)
      order = Order.find(need(payload, :order_id))
      approver = approver_for(payload, "orders.refund", actor)
      Payments::Refunder.call(order, amount_minor: payload[:amount_minor].to_i, method_code: payload[:method_code], reason: payload[:reason].to_s, actor: actor, approver: approver, device: @device, id: id)
      "accepted"
    end

    def apply_void(id, payload, actor)
      order = Order.find(need(payload, :order_id))
      return "duplicate" if order.status == "voided"
      approver = approver_for(payload, "orders.void", actor)
      Orders::Transitions.void!(order, reason: payload[:reason].presence || "voided on till", actor: actor, approver: approver, device: @device)
      "accepted"
    end

    def apply_shift_open(id, payload, actor)
      return "duplicate" if Shift.exists?(id: id)
      Shifts::Manager.open!(cashier: actor, branch: @branch, device: @device, opening_cash_minor: payload[:opening_cash_minor].to_i, id: id, client_created_at: payload[:client_created_at])
      "accepted"
    end

    def apply_shift_close(id, payload, actor)
      shift = Shift.find(id)
      return "duplicate" unless shift.open?
      Shifts::Manager.close!(shift, counted_cash_minor: payload[:counted_cash_minor].to_i, count_detail: payload[:count_detail].to_h, by: actor, note: payload[:note])
      "accepted"
    end

    # A meal taken at a kiosk while it was offline. The same id again is a duplicate; a second helping is refused with
    # canteen.already_taken, which the kiosk shows in its attention list.
    def apply_meal_claim(id, payload, actor)
      return "duplicate" if MealClaim.exists?(id: id)
      Canteen::Claims.claim!(branch: @branch, device: @device, actor: actor, id: id, fingerprint_id: payload[:fingerprint_id], employee_id: payload[:employee_id], meal_plan_item_id: payload[:meal_plan_item_id],
                             meal_session_id: payload[:meal_session_id], token_label: payload[:token_label], source: payload[:source], client_created_at: payload[:client_created_at])
      "accepted"
    end

    def apply_cash_movement(id, payload, actor)
      return "duplicate" if CashMovement.exists?(id: id)
      shift = Shift.find(need(payload, :shift_id))
      Shifts::Manager.cash_movement!(shift, kind: payload[:kind].to_s, amount_minor: payload[:amount_minor].to_i, reason: payload[:reason].to_s, by: actor, reference: payload[:reference], id: id)
      "accepted"
    end
  end
end

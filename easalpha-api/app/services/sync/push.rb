module Sync
  # Applies a till's offline queue in order. Every record carries the UUID the device made; repeats are duplicates, never double writes.
  # records: [{ type, id, membership_id?, approver_pin?, payload }]
  # The pushing session (actor) is the cashier signed in on the till; a record may name another member who signed in
  # on this till before (A2). approver_pin is a manager PIN typed on the till for that record (A3): it is checked here
  # and never stored.
  class Push
    TYPES = %w[order order_update payment refund void shift_open shift_close cash_movement meal_claim customer_payment].freeze
    CHARGE_KEYS = %i[service_charge_percent service_charge_fixed_minor delivery_charge_percent].freeze
    # A refresh token this old says that person signed in on this till at some point; older than this and the till
    # itself would have lost the session long ago.
    SIGNED_IN_WITHIN = 60.days

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
      # The PIN leaves the record first: a rejection keeps the payload, the audit log keeps what was approved, neither keeps the PIN.
      pin = record.delete(:approver_pin).to_s
      type, id, payload = record[:type].to_s, record[:id].to_s, (record[:payload] || {}).to_h.with_indifferent_access
      payload.delete(:approver_pin)
      record[:payload] = payload
      return reject(record, batch, "sync.type", "Unknown record type #{type}") unless TYPES.include?(type)
      return reject(record, batch, "sync.id", "Record id must be a UUID") unless id.match?(/\A[0-9a-f-]{36}\z/i)
      actor = actor_for(record)
      if actor.nil?
        return reject(record, batch, "actor.unknown", "That staff member has not signed in on this till") if record[:membership_id].present?
        return reject(record, batch, "sync.member", "Staff member is not active at this branch") unless type == "meal_claim" # a kiosk has no cashier
      end
      @approvals = approvals_for(pin, actor)
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

    # Who made the record. The signed-in cashier by default; another member only if they signed in on this very till
    # (a refresh token for that membership and device), and were active when the record was made.
    def actor_for(record)
      return @actor if record[:membership_id].blank? || record[:membership_id] == @actor&.id
      m = Membership.includes(:role, :user).find_by(id: record[:membership_id])
      return nil unless m && m.branch_allowed?(@branch.id) && signed_in_here?(m)
      return m if m.active?
      made_at = record.dig(:payload, :client_created_at).presence
      m if m.deactivated_at && made_at && Time.iso8601(made_at.to_s) < m.deactivated_at
    rescue ArgumentError
      nil
    end

    def signed_in_here?(membership)
      RefreshToken.where(membership_id: membership.id, device_id: @device.id).where("created_at > ?", SIGNED_IN_WITHIN.ago).exists?
    end

    # One manager PIN typed on the till covers every guarded step of that record, as approver_pin does online
    # (OrdersController#collect_approvals). A wrong PIN counts against the cashier's PIN throttle, as online, and
    # leaves the record with no approval: the guarded step then answers approval.required.
    def approvals_for(pin, actor)
      return {} if pin.blank? || actor.nil?
      approver = Auth::PinApproval.find_approver(pin: pin, permission: "app.pos", exclude_membership: actor)
      approver ? approver.permission_codes.index_with { approver } : {}
    end

    # The member whose PIN approved this step, nil when the cashier holds the permission themselves (as online).
    def approver_for(permission, actor)
      return nil if actor.can?(permission)
      @approvals[permission] || raise(Api::Errors::Forbidden.new("approval.required", "A manager with #{permission} must approve this"))
    end

    def reject(record, batch, code, message)
      SyncRejection.create!(branch_id: @branch.id, device_id: @device.id, sync_batch_id: batch.id, record_type: record[:type].to_s, record_id: (record[:id].to_s.presence || SecureRandom.uuid),
                            code: code, message: message, payload: record.to_h)
      { id: record[:id], type: record[:type], status: "rejected", code: code, message: message }
    end

    def complete?(payload) = ActiveModel::Type::Boolean.new.cast(payload[:complete]) || payload[:status].to_s == "completed"

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
      attrs[:staff_meal_approved_by_id] = (approver_for("orders.staff_meal", actor) || actor).id if attrs[:is_staff_meal]
      attrs[:client_created_at] = Orders::ClientTime.clamp(attrs[:client_created_at], record_id: id) if attrs.key?(:client_created_at)
      day = @branch.business_day_for(attrs[:client_created_at] || Time.current)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked") if DayClose.locked?(@branch.id, day)
      builder = Orders::Builder.create!(attrs, lines: Array(payload[:lines]).map(&:to_h), actor: actor, device: @device, branch: @branch, approvals: @approvals)
      order = builder.order
      Orders::Transitions.place!(order, actor: actor, device: @device) if complete?(payload) || payload[:status].to_s != "draft" && payload[:status].present?
      if payload[:voided].present? || payload[:status].to_s == "voided"
        Orders::Transitions.void!(order, reason: payload[:void_reason].presence || "voided on till", actor: actor, approver: approver_for("orders.void", actor), device: @device)
      elsif payload[:payments].present?
        Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.open.find_by(cashier_membership_id: actor.id)).call(payments: payload[:payments], tip_minor: payload[:tip_minor].to_i, offline: true)
      end
      complete!(order, actor) if complete?(payload)
      "accepted"
    end

    # True when the order took payments it was missing, or was completed as the till asked. A voided or settled order,
    # or one whose payments are all recorded, is left as it is.
    def apply_missing_payments(order, payload, actor)
      return false if payload[:voided].present? || payload[:status].to_s == "voided"
      return false unless order.status.in?(%w[draft held placed preparing ready served dispatched])
      missing = Array(payload[:payments]).map { |p| p.to_h.with_indifferent_access }.reject { |p| p[:id].present? && Payment.exists?(id: p[:id]) }
      changed = false
      if missing.any?
        tip = order.paid_minor.zero? ? payload[:tip_minor].to_i : 0
        Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.open.find_by(cashier_membership_id: actor.id)).call(payments: missing, tip_minor: tip, offline: true)
        changed = true
      end
      if complete?(payload) && !order.reload.completed? && (order.is_staff_meal || order.total_minor.zero?)
        Orders::Transitions.place!(order, actor: actor, device: @device) if order.status.in?(%w[draft held])
        complete!(order, actor)
        changed = true
      end
      changed
    end

    # A staff meal or a zero-total order taken offline closes without a payment. Anything else must be paid first:
    # the till does not place Direct Unpaid orders offline, so an unpaid order here comes back order.unpaid.
    def complete!(order, actor)
      order.reload
      return if order.completed?
      Orders::Transitions.close!(order, actor: actor, device: @device, allow_unpaid: order.is_staff_meal || order.total_minor.zero?)
    end

    # The till numbers each queued update (client_seq) and sends it again when an answer is lost. The number is recorded
    # in the same transaction as the update, so the repeat is a duplicate (its new lines carry the till's ids, which the
    # server never matches: applied again they would be added twice, the first copies cancelled, and the kitchen sent
    # both), while an update that was refused leaves nothing behind and is applied when it is tried again.
    def apply_order_update(id, payload, actor)
      seq = payload[:client_seq].to_s.strip.first(100).presence
      status = "accepted"
      Order.transaction(requires_new: true) do
        if seq && !AppliedSubmission.record!(device_id: @device.id, record_type: "order_update", record_id: id, client_seq: seq, order_id: id)
          status = "duplicate"
          next
        end
        order = Order.includes(items: :modifiers).find(id)
        builder = Orders::Builder.new(order, actor: actor, device: @device, branch: @branch)
        attrs = payload.slice(:order_type, :table_id, :guest_name, :covers, :customer_id, :notes, :delivery_charge_minor, :is_staff_meal, :staff_meal_reason, *CHARGE_KEYS).to_h.symbolize_keys
        # The staff-meal flag changed offline: on needs orders.staff_meal (the actor's own or the PIN on the record), off charges normally.
        if attrs.key?(:is_staff_meal)
          attrs[:is_staff_meal] = ActiveModel::Type::Boolean.new.cast(attrs[:is_staff_meal])
          if attrs[:is_staff_meal]
            attrs[:staff_meal_approved_by_id] = (approver_for("orders.staff_meal", actor) || actor).id unless order.is_staff_meal
            attrs[:staff_meal_reason] = order.staff_meal_reason if attrs[:staff_meal_reason].blank?
          else
            attrs[:staff_meal_reason] = nil
            attrs[:staff_meal_approved_by_id] = nil
          end
        end
        builder.update!(attrs: attrs, lines: Array(payload[:lines]).map(&:to_h), approvals: @approvals)
        Orders::Transitions.after_edit!(order, added: builder.added, removed: builder.removed)
        # A staff meal completed offline on an order the server already held: the till sends complete on the update.
        if complete?(payload) && !order.reload.completed? && (order.is_staff_meal || order.total_minor.zero?)
          Orders::Transitions.place!(order, actor: actor, device: @device) if order.status.in?(%w[draft held])
          complete!(order, actor)
        end
      end
      status
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
      approver = approver_for("orders.refund", actor)
      Payments::Refunder.call(order, amount_minor: payload[:amount_minor].to_i, method_code: payload[:method_code], reason: payload[:reason].to_s, actor: actor, approver: approver, device: @device, id: id)
      "accepted"
    end

    def apply_void(id, payload, actor)
      order = Order.find(need(payload, :order_id))
      return "duplicate" if order.status == "voided"
      approver = approver_for("orders.void", actor)
      Orders::Transitions.void!(order, reason: payload[:reason].presence || "voided on till", actor: actor, approver: approver, device: @device)
      "accepted"
    end

    def apply_shift_open(id, payload, actor)
      return "duplicate" if Shift.exists?(id: id)
      Shifts::Manager.open!(cashier: actor, branch: @branch, device: @device, opening_cash_minor: payload[:opening_cash_minor].to_i, id: id, client_created_at: payload[:client_created_at])
      "accepted"
    end

    # The manager approval on a close or a cash-out is recorded when a PIN came with the record, and not demanded
    # when none did: the same as the online endpoints.
    def apply_shift_close(id, payload, actor)
      shift = Shift.find(id)
      return "duplicate" unless shift.open?
      Shifts::Manager.close!(shift, counted_cash_minor: payload[:counted_cash_minor].to_i, count_detail: payload[:count_detail].to_h, by: actor, approver: @approvals["shifts.any"], note: payload[:note])
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
      Shifts::Manager.cash_movement!(shift, kind: payload[:kind].to_s, amount_minor: payload[:amount_minor].to_i, reason: payload[:reason].to_s, by: actor, approver: @approvals["shifts.any"], reference: payload[:reference], id: id)
      "accepted"
    end

    # Money taken against a customer's account while the till was offline (the Khata screen's Receive). The till's id
    # makes a replay a duplicate; the module must be on, the day open, and the cashier allowed to collect (or a
    # manager PIN with the record). The payment is dated the day it lands, as online; the till's day is checked too.
    def apply_customer_payment(id, payload, actor)
      return "duplicate" if CustomerPayment.exists?(id: id)
      BusinessModules.require!(@branch.business, "customer_accounts")
      approver = actor.can?("customers.manage") ? nil : approver_for("khata.collect", actor)
      customer = Customer.active.find(need(payload, :customer_id))
      made_at = Orders::ClientTime.clamp(payload[:client_created_at], table_name: "customer_payments", record_id: id)
      [ @branch.business_day_for(made_at || Time.current), @branch.business_day_for(Time.current) ].uniq.each do |day|
        raise Api::Errors::Conflict.new("day.locked", "#{day} is locked") if DayClose.locked?(@branch.id, day)
      end
      cp = Payments::Khata.receive!(customer, id: id, amount_minor: payload[:amount_minor].to_i, method_code: need(payload, :method_code), reference: payload[:reference].presence,
                                    actor: actor, shift: Shift.open.find_by(cashier_membership_id: actor.id), branch: @branch, direction: payload[:direction].presence_in(%w[received paid]) || "received")
      AuditLog.record(action: "approve", record: cp, approved_by: approver.user, after: { permission: "khata.collect", amount_minor: cp.amount_minor }) if approver
      "accepted"
    end
  end
end

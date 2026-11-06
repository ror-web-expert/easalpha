module Sync
  # Applies a till's offline queue in order. Every record carries the UUID the device made; repeats are duplicates, never double writes.
  # records: [{ signed, signed_by, sig, approver_pin?, approval_codes? }], signed being the JSON of { type, id, membership_id?,
  # payload } (Sync::Signature); a till build from before the signatures sends { type, id, membership_id?, approver_pin?,
  # approval_codes?, payload }. The pushing session (actor) is the cashier signed in on the till; a record may name
  # another member when that member's sign-in on this till signed it (actor_for). approver_pin is a manager PIN typed on
  # the till for that record (A3): it is checked here and never stored. approval_codes are the permissions the till's
  # dialog showed with it (R6): the PIN grants those.
  class Push
    TYPES = %w[order order_update payment refund void shift_open shift_close cash_movement meal_claim customer_payment].freeze
    CHARGE_KEYS = %i[service_charge_percent service_charge_fixed_minor delivery_charge_percent].freeze
    # A refresh token this old says that person signed in on this till at some point; older than this and the till
    # itself would have lost the session long ago.
    SIGNED_IN_WITHIN = 60.days
    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

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
      codes = record.key?(:approval_codes) ? Array(record.delete(:approval_codes)).map(&:to_s) & Permission.codes : nil
      record = open_signed(record)
      type, id, payload = record[:type].to_s, record[:id].to_s, (record[:payload] || {}).to_h.with_indifferent_access
      payload.delete(:approver_pin)
      payload.delete(:approval_codes)
      record[:payload] = payload
      return reject(record, batch, "sync.type", "Unknown record type #{type}") unless TYPES.include?(type)
      return reject(record, batch, "sync.id", "Record id must be a UUID") unless id.match?(/\A[0-9a-f-]{36}\z/i)
      actor = actor_for(record)
      if actor.nil?
        return reject(record, batch, "actor.unknown", "That staff member has not signed in on this till") if record[:membership_id].present?
        return reject(record, batch, "sync.member", "Staff member is not active at this branch") unless type == "meal_claim" # a kiosk has no cashier
      end
      @approvals = approvals_for(pin, actor, codes)
      status = send("apply_#{type}", id, payload, actor)
      resolve_rejections(type, id)
      { id: id, type: type, status: status }
    rescue Api::Errors::ApiError => e
      reject(record, batch, e.code, e.message, e.details)
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

    # A signed record (Sync::Signature) is read from the bytes it signed: its type, id, membership_id and payload never
    # come from beside them. The signature itself is checked by actor_for, and only when the record names another member.
    def open_signed(record)
      @signed = nil
      return record unless record.key?(:signed)
      body = record[:signed]
      data = body.is_a?(String) ? JSON.parse(body) : nil
      raise Api::Errors::BadRequest.new("sync.signed", "signed must be the record as JSON") unless data.is_a?(Hash)
      @signed = { by: record[:signed_by].to_s, sig: record[:sig].to_s, body: body }
      data.slice("type", "id", "membership_id", "payload").merge("signed_by" => @signed[:by]).with_indifferent_access
    rescue JSON::ParserError
      raise Api::Errors::BadRequest.new("sync.signed", "signed must be the record as JSON")
    end

    # Who made the record. The pushing session's own member when it names them or nobody, signed or not. Another member
    # only through their signature: made with the key their PIN sign-in on this till was given, from a session still
    # running at the record's time (its clamped client_created_at, or now when it carries none). So a member
    # deactivated or signed out since keeps what they did before, and nothing dated after (sync-auth#0, #4).
    def actor_for(record)
      named = record[:membership_id].presence
      return @actor if named.nil? || named == @actor&.id
      @signed ? signed_actor(record, named) : unsigned_actor(record, named)
    end

    # The signing token must be that member's, from a sign-in on this till, and the member of this business and branch.
    def signed_actor(record, named)
      rt = @signed[:by].match?(UUID) ? RefreshToken.find_by(id: @signed[:by]) : nil
      m = rt && Membership.includes(:role, :user).find_by(id: named) # tenant-scoped: another business's member is not found
      unless m && Sync::Signature.matches?(rt.id, @signed[:body], @signed[:sig]) && rt.membership_id == m.id && rt.device_id == @device.id && rt.app == "pos" && m.branch_allowed?(@branch.id)
        raise Api::Errors::Forbidden.new("actor.signature", "The record's signature is not from the staff member it names, on this till")
      end
      made = Sync::Signature.made_at(record[:payload]) || Time.current
      return m if Sync::Signature.session_running_at?(rt.id, made)
      raise Api::Errors::Forbidden.new("actor.session_ended", "#{m.user&.name || 'That staff member'} was no longer signed in on this till when this record was made")
    end

    # A record from a till build before the signatures. Until Signature::SUNSET it is taken under the old rule (that
    # member signed in on this till within 60 days, and was active when it was made, by its clamped time) and logged;
    # after it, only the member who made it can send it, signed in themselves.
    def unsigned_actor(record, named)
      if Time.current >= Sync::Signature::SUNSET
        raise Api::Errors::Forbidden.new("actor.unsigned", "Only the staff member who made this record can send it now: ask them to sign in on this till, then Try again")
      end
      m = Membership.includes(:role, :user).find_by(id: named)
      return nil unless m && m.branch_allowed?(@branch.id) && signed_in_here?(m)
      unless m.active?
        made = Sync::Signature.made_at(record[:payload])
        return nil unless m.deactivated_at && made && made < m.deactivated_at
      end
      Rails.logger.warn("[sync.unsigned] #{record[:type]} #{record[:id]} names membership #{m.id}, pushed by #{@actor&.id || 'no session'} from device #{@device.id} (business #{@device.business_id})")
      m
    end

    def signed_in_here?(membership)
      RefreshToken.where(membership_id: membership.id, device_id: @device.id).where("created_at > ?", SIGNED_IN_WITHIN.ago).exists?
    end

    # A manager PIN typed on the till grants that record's guarded steps the till's dialog showed the manager
    # (approval_codes, from the rejection's details.permissions) and the manager holds, as approver_pin does online
    # (OrdersController#collect_approvals). A record from a till before 6 Nov 2026 has no codes: its PIN still covers
    # every guarded step, for one release, and the log says so (R6). A wrong PIN counts against the cashier's PIN
    # throttle, as online, and leaves the record with no approval: the guarded step then answers approval.required.
    # Each step goes to a holder of the PIN who has its permission, so a PIN two staff share still finds the manager.
    def approvals_for(pin, actor, codes)
      return {} if pin.blank? || actor.nil?
      approvals = Auth::PinApproval.approvals_for(pin: pin, permissions: codes, exclude_membership: actor)
      Rails.logger.warn("[approval.legacy] sync push: approver_pin without approval_codes grants every permission of membership #{approvals.values.map(&:id).uniq.join(', ')} (device #{@device.id})") if codes.nil? && approvals.any?
      approvals
    end

    # The member whose PIN approved this step, nil when the cashier holds the permission themselves (as online).
    # The refusal names the permission, so the till's Try again asks the manager for exactly that.
    def approver_for(permission, actor)
      return nil if actor.can?(permission)
      @approvals[permission] || raise(Api::Errors.approval_required([ permission ], "A manager with #{permission} must approve this"))
    end

    # One open refusal per till and record (K7): refused again (each Try again), the open row is brought up to date.
    # The signature is not kept; the record is, as the till sent it.
    def reject(record, batch, code, message, details = nil)
      key = { device_id: @device.id, record_type: record[:type].to_s, record_id: record[:id].to_s.match?(UUID) ? record[:id].to_s : SecureRandom.uuid }
      attrs = { branch_id: @branch.id, sync_batch_id: batch.id, code: code, message: message, payload: record.to_h.except("sig") }
      begin
        SyncRejection.transaction(requires_new: true) { SyncRejection.open.find_or_initialize_by(key).update!(attrs) }
      rescue ActiveRecord::RecordNotUnique # the same record refused by a push running alongside this one
        SyncRejection.open.find_by!(key).update!(attrs)
      end
      { id: record[:id], type: record[:type], status: "rejected", code: code, message: message, details: details }.compact
    end

    # A record that went through (accepted, or already here) settles its earlier refusals, from any push (K7).
    def resolve_rejections(type, id)
      SyncRejection.open.where(record_type: type, record_id: id).update_all(resolved_at: Time.current, resolution: "accepted", resolved_by_membership_id: @actor&.id, updated_at: Time.current)
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
      # Money taken by someone who may not take it refuses the record before anything is written.
      voided = payload[:voided].present? || payload[:status].to_s == "voided"
      payment_approver = payload[:payments].present? && !voided ? payment_approver!(actor) : nil
      day = @branch.business_day_for(attrs[:client_created_at] || Time.current)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked") if DayClose.locked?(@branch.id, day)
      builder = Orders::Builder.create!(attrs, lines: Array(payload[:lines]).map(&:to_h), actor: actor, device: @device, branch: @branch, approvals: @approvals)
      order = builder.order
      Orders::Transitions.place!(order, actor: actor, device: @device) if complete?(payload) || payload[:status].to_s != "draft" && payload[:status].present?
      if voided
        Orders::Transitions.void!(order, reason: payload[:void_reason].presence || "voided on till", actor: actor, approver: approver_for("orders.void", actor), device: @device)
      elsif payload[:payments].present?
        Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.for_till(device: @device, membership: actor, branch: @branch)).call(payments: payload[:payments], tip_minor: payload[:tip_minor].to_i, offline: true)
        audit_payment_approval(payment_approver, order, Array(payload[:payments]))
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
        approver = payment_approver!(actor)
        tip = order.paid_minor.zero? ? payload[:tip_minor].to_i : 0
        Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.for_till(device: @device, membership: actor, branch: @branch)).call(payments: missing, tip_minor: tip, offline: true)
        audit_payment_approval(approver, order, missing)
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
        # address_id as the online PATCH takes it: the builder keeps it only when it is the order's customer's (L3).
        attrs = payload.slice(:order_type, :table_id, :guest_name, :covers, :customer_id, :address_id, :notes, :delivery_charge_minor, :is_staff_meal, :staff_meal_reason, *CHARGE_KEYS).to_h.symbolize_keys
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
        # Sent to the kitchen on the till while the order was a draft here (an edit made while the order's own push
        # was out comes as an update, sync.ts): placed now, as the order record would have been.
        Orders::Transitions.place!(order, actor: actor, device: @device) if payload[:status].to_s == "placed" && order.reload.status.in?(%w[draft held])
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
      approver = payment_approver!(actor)
      Payments::Processor.new(order, actor: actor, device: @device, shift: Shift.for_till(device: @device, membership: actor, branch: @branch)).call(payments: [ payload.merge(id: id) ], tip_minor: replayed_tip(order, payload, id), offline: true)
      audit_payment_approval(approver, order, [ payload.merge(id: id) ])
      "accepted"
    end

    # Money taken offline needs payments.take on the member who took it, as POST /orders/:id/payments does, or, for a
    # member who takes orders, a manager's PIN on the record (approver_pin with approval_codes): without it the record
    # is refused as approval.required, and Try again asks the manager; one who takes no orders is refused outright, as
    # online. A waiter's queued payment went through (final round, P4, whose till now refuses it offline up front).
    def payment_approver!(actor)
      require_permission!(actor, "payments.take", "orders.create")
      approver_for("payments.take", actor)
    end

    # The manager who approved is written to the audit log.
    def audit_payment_approval(approver, order, payments)
      return unless approver
      lines = payments.map { |p| p.to_h.with_indifferent_access }
      AuditLog.record(action: "approve", record: order, approved_by: approver.user,
                      after: { permission: "payments.take", payment_ids: lines.filter_map { |p| p[:id].presence }, amount_minor: lines.sum { |p| p[:amount_minor].to_i } })
    end

    # A queued payment's tip, taken while the order has none yet. A till from before 6 Nov 2026 put the whole tip on
    # every split of an offline payment, and each replay added it again (two splits with a 5,000 tip gave 10,000 and
    # left the order part-paid); the till since puts it on the first split only, but the old records are still in
    # the tills' queues (final round, deploy#6). A tip refused here goes to the audit log, as an adjusted payment does.
    def replayed_tip(order, payload, id)
      tip = payload[:tip_minor].to_i
      return 0 unless tip.positive?
      return tip if order.tip_minor.to_i.zero?
      AuditLog.record(action: "offline_payment_adjusted", record: order, before: { payment_id: id, tip_minor: tip },
                      after: { tip_minor: 0, order_tip_minor: order.tip_minor, reason: "the order already has a tip" })
      0
    end

    def apply_refund(id, payload, actor)
      return "duplicate" if Refund.exists?(id: id)
      order = Order.find(need(payload, :order_id))
      approver = approver_for("orders.refund", actor)
      Payments::Refunder.call(order, amount_minor: payload[:amount_minor].to_i, method_code: payload[:method_code], reason: payload[:reason].to_s, actor: actor, approver: approver, device: @device, id: id,
                                     shift: Shift.for_till(device: @device, membership: actor, branch: @branch))
      "accepted"
    end

    def apply_void(id, payload, actor)
      order = Order.find(need(payload, :order_id))
      return "duplicate" if order.status == "voided"
      approver = approver_for("orders.void", actor)
      Orders::Transitions.void!(order, reason: payload[:reason].presence || "voided on till", actor: actor, approver: approver, device: @device)
      "accepted"
    rescue Api::Errors::Conflict => e
      # Another void landed between the read above and void!'s row lock (another till, the admin): the order is voided,
      # as the record asked, so it is the duplicate a void replayed twice is, not a refusal for the Attention page (L3).
      raise unless e.code == "order.status" && order && Order.where(id: order.id, status: "voided").exists?
      "duplicate"
    end

    # Shift records go through the checks the online shift endpoints make (ShiftsController): queued, they skipped
    # them all, so a waiter could close a cashier's shift with any count or take a payout from their drawer (final
    # round, sync-auth#1). Shifts::Manager.open! keeps the till's time in the orders' window and puts a shift opened
    # on a day locked since on today.
    def apply_shift_open(id, payload, actor)
      return "duplicate" if Shift.exists?(id: id)
      require_permission!(actor, "shifts.own", "shifts.any")
      Shifts::Manager.open!(cashier: actor, branch: @branch, device: @device, opening_cash_minor: payload[:opening_cash_minor].to_i, id: id, client_created_at: payload[:client_created_at])
      "accepted"
    end

    # The manager approval on a close is recorded when a PIN came with the record, and not demanded when none did: the
    # same as POST /shifts/:id/close, which also lets only the shift's cashier or a manager close it. Not anyone signed
    # in on that till (Shifts::Manager.may_move?, which cash movements use behind a cash.in_out PIN): a close needs no
    # PIN, so a waiter on the till could close the cashier's shift with any count. The record's id is the shift's
    # (payload shift_id from a till that gives the close its own id, so it does not replace a queued shift_open).
    def apply_shift_close(id, payload, actor)
      shift = branch_shift(payload[:shift_id].presence || id)
      return "duplicate" unless shift.open?
      own_shift!(shift, actor, "Only the cashier or a manager can close this shift")
      fingerprint_checked_in!(shift)
      Shifts::Manager.close!(shift, counted_cash_minor: payload[:counted_cash_minor].to_i, count_detail: payload[:count_detail].to_h, by: actor, approver: given_approval("shifts.any", actor), note: payload[:note])
      "accepted"
    end

    # A meal taken at a kiosk while it was offline. The same id again is a duplicate; a second helping is refused with
    # canteen.already_taken, which the kiosk shows in its attention list.
    def apply_meal_claim(id, payload, actor)
      return "duplicate" if MealClaim.exists?(id: id)
      Canteen::Claims.claim!(branch: @branch, device: @device, actor: actor, id: id, fingerprint_id: payload[:fingerprint_id], employee_id: payload[:employee_id], meal_plan_item_id: payload[:meal_plan_item_id],
                             meal_session_id: payload[:meal_session_id], token_label: payload[:token_label], source: payload[:source], client_created_at: payload[:client_created_at], replay: true)
      "accepted"
    end

    # As POST /shifts/:id/cash_movements: a shift at this branch that the member may move cash on (theirs, a
    # manager's, or the one open on this till), one of the four kinds, and the manager's PIN on the record when the
    # member lacks cash.in_out or goes above its limit (Shifts::Manager.cash_movement! refuses it as approval.required
    # otherwise); a PIN sent anyway is recorded.
    def apply_cash_movement(id, payload, actor)
      return "duplicate" if CashMovement.exists?(id: id)
      shift = branch_shift(need(payload, :shift_id))
      raise Api::Errors::Forbidden.new("permission.denied", "Not your shift") unless Shifts::Manager.may_move?(shift, member: actor, device: @device)
      kind = payload[:kind].to_s
      raise Api::Errors::BadRequest.new("cash.kind", "kind must be cash_in, cash_out, payout or drop") unless kind.in?(%w[cash_in cash_out payout drop])
      amount = payload[:amount_minor].to_i
      needs_pin = Shifts::Manager.movement_needs_approval?(actor, kind, amount)
      approver = actor.can?("shifts.any") || (kind == "cash_in" && !needs_pin) ? nil : @approvals["shifts.any"]
      Shifts::Manager.cash_movement!(shift, kind: kind, amount_minor: amount, reason: payload[:reason].to_s, by: actor, approver: approver, reference: payload[:reference], id: id,
                                            category_id: payload[:category_id].presence, paid_to: payload[:paid_to])
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
                                    actor: actor, shift: Shift.for_till(device: @device, membership: actor, branch: @branch), branch: @branch, direction: payload[:direction].presence_in(%w[received paid]) || "received")
      AuditLog.record(action: "approve", record: cp, approved_by: approver.user, after: { permission: "khata.collect", amount_minor: cp.amount_minor }) if approver
      "accepted"
    end

    # --- the online shift endpoints' checks, for the member a shift record names ---

    def branch_shift(id) = Shift.where(branch_id: @branch.id).find(id)

    def require_permission!(actor, *codes)
      return if codes.any? { |c| actor.can?(c) }
      raise Api::Errors::Forbidden.new("permission.denied", "Missing permission: #{codes.join(' or ')}")
    end

    def own_shift!(shift, actor, message)
      raise Api::Errors::Forbidden.new("permission.denied", message) unless shift.cashier_membership_id == actor.id || actor.can?("shifts.any")
    end

    # A manager's PIN with the record, for a step the actor may also take alone (as online: recorded, not demanded).
    def given_approval(permission, actor) = actor.can?(permission) ? nil : @approvals[permission]

    # The payroll rule "fingerprint to close the shift", as ShiftsController#close: a check-in by fingerprint on the
    # shift's day or today (a close made offline reaches the server later, and the till sends no time with it).
    def fingerprint_checked_in!(shift)
      return unless BusinessModules.on?(@branch.business, "payroll")
      emp = Employee.active.find_by(membership_id: shift.cashier_membership_id)
      return unless emp&.rule&.require_fingerprint_to_close_shift
      days = [ shift.business_day, @branch.business_day_for(Time.current) ].compact.uniq
      return if ::Attendance.exists?(employee_id: emp.id, business_day: days, source: "fingerprint")
      raise Api::Errors::Forbidden.new("shift.fingerprint_required", "Check in with the fingerprint device before closing the shift")
    end
  end
end

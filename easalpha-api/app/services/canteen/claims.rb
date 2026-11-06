module Canteen
  # A worker's meal: identify, check the session and plan, refuse a second helping, then an order on the worker's
  # account (khata) with the company's share on an internal method, and a token for the counter.
  class Claims
    SUBSIDY_CODE = "canteen_subsidy".freeze
    PAYROLL_CODE = "canteen_payroll".freeze
    GRACE = Sessions::GRACE
    # A meal a kiosk served offline is still recorded when its claim reaches the server this long after the scan: a
    # weekend without internet is believable, a claim from last week is not (a manager records that one by hand).
    REPLAY_WINDOW = 72.hours

    # replay: the claim was queued by a kiosk with no connection and arrives through Sync::Push. A live claim is judged
    # by the server clock (the kiosk's clock only stamps it, within the grace). A replay is judged at the kiosk's scan
    # time when that is not in the future and within REPLAY_WINDOW: the session must have held that moment and the
    # meal goes on that session's day, so a lunch served during an outage is recorded and charged when the link
    # returns (6 Nov 2026 review). A scan outside every session, or a second meal, is still refused.
    def self.claim!(branch:, device: nil, actor: nil, id: nil, fingerprint_id: nil, employee_id: nil, meal_plan_item_id: nil, meal_session_id: nil, token_label: nil, source: nil, client_created_at: nil, replay: false)
      now = Time.current
      client_at = client_created_at.present? ? Time.iso8601(client_created_at.to_s) : nil
      at = client_at && client_at <= now + GRACE && (replay || client_at >= now - GRACE) ? client_at : now
      judged = replay ? at : now
      raise Api::Errors::Conflict.new("canteen.too_old", "Taken offline on #{local(at, branch).strftime('%-d %b at %H:%M')}, more than 72 hours ago: record it by hand") if at < now - REPLAY_WINDOW
      # With manual lookup off a kiosk identifies by finger only; a meal it took by name before the switch still lands.
      if employee_id.present? && actor.nil? && !replay && branch.business.setting("canteen.manual_lookup") == false
        raise Api::Errors::Forbidden.new("canteen.manual_lookup", "Manual lookup is switched off: identify the worker by fingerprint")
      end
      employee = employee_id.present? ? Employee.active.find_by(id: employee_id) : nil
      employee ||= Workers.find_by_fingerprint(fingerprint_id)
      raise Api::Errors::NotFound.new("canteen.unknown_worker", "No enrolled worker matches") unless employee
      if id.present? && (same = MealClaim.find_by(id: id, employee_id: employee.id))
        return same # the same claim arriving twice
      end
      moment = replay ? "at #{local(judged, branch).strftime('%H:%M')}" : "now"
      session = meal_session_id.present? ? MealSession.active.where(branch_id: branch.id).find(meal_session_id) : Sessions.current(branch, at: judged, grace: GRACE)
      raise Api::Errors::Conflict.new("canteen.no_session", "No meal is being served #{moment}") unless session
      # The day of the session's window, not of the clock: a night shift past the business-day end is one meal.
      date = Sessions.day_for(branch, session, judged, grace: GRACE)
      raise Api::Errors::Conflict.new("canteen.session_closed", "#{session.name} is not being served #{moment}") unless date
      plan = MealPlan.includes(items: :product).find_by(branch_id: branch.id, meal_session_id: session.id, plan_date: date, status: "published")
      raise Api::Errors::Conflict.new("canteen.no_plan", "The #{session.name} menu for #{date.strftime('%-d %b')} is not published yet") unless plan
      # One meal per worker per session (MealSession); the unique index holds it when two kiosks race.
      existing = live_claim(employee, date, session)
      raise already_taken(existing) if existing
      item = meal_plan_item_id.present? ? plan.items.detect { |i| i.id == meal_plan_item_id.to_s } : (plan.items.size == 1 ? plan.items.first : nil)
      raise Api::Errors::BadRequest.new("canteen.choose_dish", "Choose a dish") unless item
      raise Api::Errors::Conflict.new("canteen.sold_out", "#{item.product.name} is finished for #{session.name}") if item.sold_out?
      customer = Workers.link!(employee)
      claim = nil
      begin
        MealClaim.transaction do
          order = Orders::Builder.create!({ order_type: "walk_in", source: "kiosk", customer_id: customer.id, guest_name: employee.name, notes: "Canteen #{session.name}", client_created_at: at },
                                          lines: [ { product_id: item.product_id, quantity: 1 } ], actor: actor, device: device, branch: branch).order
          worker_price = item.worker_price_minor.present? ? [ item.worker_price_minor, order.total_minor ].min : order.total_minor
          token_no = DocumentCounter.next!("meal_token:#{branch.id}:#{date}:#{session.id}")
          claim = MealClaim.create!(id: id.presence, branch: branch, meal_session: session, meal_plan: plan, meal_plan_item: item, employee: employee, customer: customer, order: order,
                                    plan_date: date, token_no: token_no, token_label: token_label.presence || "M-#{token_no}", scanned_at: at, device: device,
                                    source: source.to_s.presence_in(MealClaim::SOURCES) || (fingerprint_id.present? ? "fingerprint" : "manual"), fingerprint_id: fingerprint_id.presence,
                                    worker_price_minor: worker_price, company_share_minor: order.total_minor - worker_price, client_created_at: client_at)
          MealPlanItem.where(id: item.id).update_all("claims_count = claims_count + 1")
          pay!(order, claim, actor: actor, device: device)
          AuditLog.record(action: "create", record: claim, after: { employee: employee.name, dish: item.product.name, token: claim.token_label, worker_minor: worker_price, company_minor: claim.company_share_minor,
                                                                    **(replay ? { offline: true, taken_at: at.iso8601 } : {}) })
        end
      rescue ActiveRecord::RecordNotUnique
        # Two kiosks served the same worker in the same second: the database kept one; this one is the second helping.
        existing = live_claim(employee, date, session)
        raise existing ? already_taken(existing) : Api::Errors::Conflict.new("canteen.duplicate", "This meal was already recorded")
      end
      claim
    end

    def self.local(time, branch) = time.in_time_zone(branch.time_zone)

    def self.live_claim(employee, date, session)
      MealClaim.live.includes(meal_plan_item: :product).find_by(employee_id: employee.id, plan_date: date, meal_session_id: session.id)
    end

    def self.already_taken(existing)
      time = existing.scanned_at.in_time_zone(existing.branch.time_zone).strftime("%H:%M")
      Api::Errors::Conflict.new("canteen.already_taken", "#{existing.employee.name} already took #{existing.product.name} at #{time}, token #{existing.token_label}",
                                details: { claim: CanteenSerializers.claim(existing) })
    end

    # The worker's share goes on their account, the rest on the company's internal method; a free meal is just placed.
    # The books (Finance::Journal.internal_sale!): the meal is sold at its menu price, so revenue and output tax are
    # the order's; the worker owes their share (receivable, cleared by the payroll deduction) and the company's share
    # is a Staff Meals expense, never money in a bank.
    def self.pay!(order, claim, actor:, device:)
      if order.total_minor.zero?
        Orders::Transitions.place!(order, actor: actor, device: device)
        return
      end
      lines = []
      lines << { method_code: "khata", amount_minor: claim.worker_price_minor } if claim.worker_price_minor.positive?
      if claim.company_share_minor.positive?
        internal_method!(SUBSIDY_CODE, "Company subsidy")
        lines << { method_code: SUBSIDY_CODE, amount_minor: claim.company_share_minor }
      end
      Payments::Processor.new(order, actor: actor, device: device).call(payments: lines)
    end

    # Methods the system pays with that the till never shows. They move no money, so they have no payment account.
    def self.internal_method!(code, name)
      m = PaymentMethod.find_by(code: code)
      m ||= PaymentMethod.create!(code: code, name: name, kind: "custom", works_offline: true, internal: true, sort_order: 99)
      m.update!(active: true, internal: true) unless m.active && m.internal
      m
    end

    def self.serve!(claim, by: nil, device: nil)
      raise Api::Errors::Conflict.new("canteen.cancelled", "This meal was cancelled") if claim.cancelled?
      return claim if claim.served?
      MealClaim.transaction do
        claim.update!(status: "served", served_at: Time.current, served_by_membership_id: by&.id)
        order = claim.order
        # "paid" counts as completed for the till, but the canteen order is done only when the meal is in the worker's hands.
        Orders::Transitions.close!(order, actor: by, device: device) if order && order.status.in?(%w[paid placed preparing ready served])
      end
      claim
    end

    def self.cancel!(claim, by:, reason:)
      raise Api::Errors::Conflict.new("canteen.cancelled", "This meal is already cancelled") if claim.cancelled?
      raise Api::Errors::BadRequest.new("canteen.reason", "A reason is required") if reason.blank?
      MealClaim.transaction do
        claim.update!(status: "cancelled", cancelled_at: Time.current, cancelled_by_membership_id: by&.id, cancel_reason: reason)
        MealPlanItem.where(id: claim.meal_plan_item_id).update_all("claims_count = GREATEST(claims_count - 1, 0)")
        if (order = claim.order)
          if order.paid_minor.positive?
            Payments::Refunder.call(order, amount_minor: claim.worker_price_minor, method_code: "khata", reason: "canteen: #{reason}", actor: by) if claim.worker_price_minor.positive?
            Payments::Refunder.call(order, amount_minor: claim.company_share_minor, method_code: SUBSIDY_CODE, reason: "canteen: #{reason}", actor: by) if claim.company_share_minor.positive?
          elsif order.status.in?(%w[draft held placed preparing ready served])
            Orders::Transitions.void!(order, reason: "canteen: #{reason}", actor: by, approver: nil)
          end
        end
        AuditLog.record(action: "void", record: claim, after: { reason: reason, token: claim.token_label })
      end
      claim
    end
  end
end

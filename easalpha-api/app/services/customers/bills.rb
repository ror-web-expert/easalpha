module Customers
  # Sends bills for a period to many customers and records the outcome in a BillRun: the month-end job (once per
  # period) or an owner pressing Send bills. One failure never stops the rest. Each customer's result is saved as soon
  # as it is known, so a run cut short by a restart keeps what went out, and the month-end job carries it on.
  module Bills
    module_function

    NOT_CONNECTED = "whatsapp.not_connected"
    STALE = 10.minutes # a running run with no progress for this long was cut short
    COUNTS = { "sent" => "sent_count", "failed" => "failed_count", "skipped" => "skipped_count" }.freeze

    def run!(from:, to:, trigger: "manual", actor: nil, customer_ids: nil, due_on: :default, min_balance_minor: nil)
      business = Current.business
      BusinessModules.require!(business, "customer_accounts")
      Whatsapp::Account.guard!(business)
      require_connected!(business)
      today = business_today
      due_on = Customers::Bill.due_on_for(business, today) if due_on == :default
      run = BillRun.create!(period_from: from, period_to: to, due_on: due_on, trigger: trigger, status: "running", by_membership_id: actor&.id)
      send_all!(run, targets(business, customer_ids: customer_ids, min_balance_minor: min_balance_minor), today: today)
    end

    # The month-end job: from the chosen day of the month on, bills for last month to everyone who owes at least the
    # minimum, once per period. A missed day (the server was down, WhatsApp was not connected) is caught up on a later
    # day of the month, and a run cut short carries on with the customers it had not reached.
    def monthly!(business, today:)
      return unless BusinessModules.on?(business, "customer_accounts")
      return unless ActiveModel::Type::Boolean.new.cast(business.setting("khata.monthly_bills.enabled"))
      return unless Whatsapp::Account.master_enabled?(business)
      day = business.setting("khata.monthly_bills.day").to_i.clamp(1, 28)
      return if today.day < day
      from, to = Customers::Bill.last_month(today)
      run = BillRun.find_by(trigger: "auto", period_from: from, period_to: to)
      if run
        resume!(run, today: today) if run.status == "running" && run.updated_at < STALE.ago
      elsif today.day == day || !switched_on_after?(today.change(day: day))
        run!(from: from, to: to, trigger: "auto")
      end
    rescue ActiveRecord::RecordNotUnique
      nil
    rescue Api::Errors::Conflict => e
      raise unless e.code == NOT_CONNECTED
      waiting!(from)
      nil
    end

    # Monthly bills switched on after this month's bill day: that day was not missed, so the first bills wait for next
    # month instead of going out at once. Settings save only the keys that changed, so the row dates the switch.
    def switched_on_after?(bill_day)
      on = Setting.where(branch_id: nil, key: "khata.monthly_bills.enabled").pick(:updated_at)
      branch = Branch.active.order(is_main: :desc).first
      on.present? && branch.present? && on >= branch.business_day_end_at(bill_day)
    end

    # Carries on a run cut short: only the customers it has not reached get a bill. The run is claimed first, so two
    # workers never carry on the same one.
    def resume!(run, today:)
      require_connected!(Current.business)
      return unless BillRun.where(id: run.id, status: "running", updated_at: ...STALE.ago).update_all(updated_at: Time.current) == 1
      send_all!(run.reload, targets(Current.business), today: today)
    end

    # Bills go out only while WhatsApp can send; otherwise each message would be stored unsent and counted as sent.
    def require_connected!(business) = Whatsapp::Provider.require_live!(business)

    # Who gets a bill: the customers chosen, or everyone who owes at least the minimum (the setting is in rupees).
    def targets(business, customer_ids: nil, min_balance_minor: nil)
      scope = Customer.active.where(is_walk_in: false)
      return scope.where(id: customer_ids) if customer_ids.present?
      scope.where("balance_minor >= ?", [ min_balance_minor || business.setting("khata.monthly_bills.min_balance").to_i * 100, 1 ].max)
    end

    # Sends to every customer the run has not reached yet, saving each result as it goes, then closes the run.
    def send_all!(run, scope, today:)
      attach = ActiveModel::Type::Boolean.new.cast(Current.business.setting("khata.monthly_bills.attach_pdf")) != false
      reached = run.results.map { |r| r["customer_id"] }
      scope.where.not(id: reached).order(:khata_no).each { |c| record!(run, send_one(run, c, today: today, attach: attach)) }
      finish!(run)
    end

    # A bill counts as sent only when a message for it is queued to go out.
    def send_one(run, c, today:, attach:)
      bill = Customers::Bill.build(c, from: run.period_from, to: run.period_to, due_on: run.due_on, issued_on: today, items: false)
      msgs = Customers::Notify.bill!(c, bill: bill, link: Customers::BillToken.url(c, from: run.period_from, to: run.period_to, due_on: run.due_on), attach_pdf: attach)
      queued = msgs.compact.select { |m| m.status == "queued" }
      return { customer_id: c.id, name: c.name, khata_no: c.khata_no, status: "failed", error: "WhatsApp was not connected, so it was not sent" } if queued.empty?
      { customer_id: c.id, name: c.name, khata_no: c.khata_no, due_minor: [ bill[:closing_balance_minor], 0 ].max, status: "sent", to: queued.map(&:to_phone) }
    rescue Api::Errors::ApiError => e
      { customer_id: c.id, name: c.name, khata_no: c.khata_no, status: e.code == "whatsapp.no_phone" ? "skipped" : "failed", error: e.message }
    rescue StandardError => e
      Rails.logger.error("[bills] #{c.id}: #{e.class} #{e.message}")
      { customer_id: c.id, name: c.name, khata_no: c.khata_no, status: "failed", error: e.message.to_s[0, 200] }
    end

    # One customer's result and the counts in one statement.
    def record!(run, row)
      count = COUNTS.fetch(row[:status])
      BillRun.where(id: run.id).update_all([ "results = results || ?::jsonb, customers_count = customers_count + 1, #{count} = #{count} + 1, updated_at = ?", [ row ].to_json, Time.current ])
    end

    def finish!(run)
      run.reload
      counted = ->(status) { run.results.count { |r| r["status"] == status } }
      run.update!(status: "done", customers_count: run.results.size, sent_count: counted.("sent"), failed_count: counted.("failed"), skipped_count: counted.("skipped"))
      AuditLog.record(action: "create", record: run, after: { period: "#{run.period_from}..#{run.period_to}", trigger: run.trigger, sent: run.sent_count, failed: run.failed_count, skipped: run.skipped_count })
      notify_owner!(run)
      run
    end

    def business_today = Branch.active.order(is_main: :desc).first&.business_day_for(Time.current) || Date.current

    def notify_owner!(run)
      body = "#{run.sent_count} sent, #{run.failed_count} failed, #{run.skipped_count} without a phone."
      Notification.create!(kind: "bill_run", title: "Bills for #{run.period_from.strftime('%B %Y')} #{run.trigger == 'auto' ? 'sent automatically' : 'sent'}", body: body, link: "/admin/customers/bills")
    rescue StandardError => e
      Rails.logger.error("[bills] owner notification failed: #{e.message}")
    end

    # Once per period: the month-end bills are due but WhatsApp cannot send. The job tries again every day.
    def waiting!(from)
      title = "Bills for #{from.strftime('%B %Y')} are waiting for WhatsApp"
      return if Notification.exists?(kind: "bill_run", title: title)
      Notification.create!(kind: "bill_run", title: title, body: "WhatsApp is not connected. They are tried again every morning this month, or send them from Monthly Bills.", link: "/admin/customers/bills")
    rescue StandardError => e
      Rails.logger.error("[bills] owner notification failed: #{e.message}")
    end

    def serialize(run, full: false)
      h = { id: run.id, period_from: run.period_from, period_to: run.period_to, due_on: run.due_on, trigger: run.trigger, status: run.status, customers_count: run.customers_count,
            sent_count: run.sent_count, failed_count: run.failed_count, skipped_count: run.skipped_count, by_membership_id: run.by_membership_id, created_at: run.created_at }
      h[:results] = run.results if full
      h
    end
  end
end

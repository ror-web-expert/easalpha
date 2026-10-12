module Customers
  # Sends bills for a period to many customers and records the outcome in a BillRun: the month-end job (once per
  # period) or an owner pressing Send bills. One failure never stops the rest.
  module Bills
    module_function

    def run!(from:, to:, trigger: "manual", actor: nil, customer_ids: nil, due_on: :default, min_balance_minor: nil)
      business = Current.business
      BusinessModules.require!(business, "customer_accounts")
      Whatsapp::Account.guard!(business)
      today = Branch.active.order(is_main: :desc).first&.business_day_for(Time.current) || Date.current
      due_on = Customers::Bill.due_on_for(business, today) if due_on == :default
      run = BillRun.create!(period_from: from, period_to: to, due_on: due_on, trigger: trigger, status: "running", by_membership_id: actor&.id)
      scope = Customer.active.where(is_walk_in: false)
      scope = customer_ids.present? ? scope.where(id: customer_ids) : scope.where("balance_minor >= ?", [ min_balance_minor || business.setting("khata.monthly_bills.min_balance").to_i * 100, 1 ].max)
      attach = ActiveModel::Type::Boolean.new.cast(business.setting("khata.monthly_bills.attach_pdf")) != false
      results = scope.order(:khata_no).map do |c|
        bill = Customers::Bill.build(c, from: from, to: to, due_on: due_on, issued_on: today)
        msgs = Customers::Notify.bill!(c, bill: bill, link: Customers::BillToken.url(c, from: from, to: to, due_on: due_on), attach_pdf: attach)
        { customer_id: c.id, name: c.name, khata_no: c.khata_no, due_minor: [ bill[:closing_balance_minor], 0 ].max, status: "sent", to: msgs.map(&:to_phone) }
      rescue Api::Errors::ApiError => e
        { customer_id: c.id, name: c.name, khata_no: c.khata_no, status: e.code == "whatsapp.no_phone" ? "skipped" : "failed", error: e.message }
      rescue StandardError => e
        Rails.logger.error("[bills] #{c.id}: #{e.class} #{e.message}")
        { customer_id: c.id, name: c.name, khata_no: c.khata_no, status: "failed", error: e.message.to_s[0, 200] }
      end
      run.update!(status: "done", results: results, customers_count: results.size, sent_count: results.count { |r| r[:status] == "sent" },
                  failed_count: results.count { |r| r[:status] == "failed" }, skipped_count: results.count { |r| r[:status] == "skipped" })
      AuditLog.record(action: "create", record: run, after: { period: "#{from}..#{to}", trigger: trigger, sent: run.sent_count, failed: run.failed_count, skipped: run.skipped_count })
      notify_owner!(run)
      run
    end

    # The month-end job: on the chosen day, bills for last month to everyone who owes at least the minimum. Once only.
    def monthly!(business, today:)
      return unless BusinessModules.on?(business, "customer_accounts")
      return unless ActiveModel::Type::Boolean.new.cast(business.setting("khata.monthly_bills.enabled"))
      return unless Whatsapp::Account.master_enabled?(business)
      day = business.setting("khata.monthly_bills.day").to_i.clamp(1, 28)
      return unless today.day == day
      from, to = Customers::Bill.last_month(today)
      return if BillRun.exists?(trigger: "auto", period_from: from, period_to: to)
      run!(from: from, to: to, trigger: "auto")
    rescue ActiveRecord::RecordNotUnique
      nil
    end

    def notify_owner!(run)
      body = "#{run.sent_count} sent, #{run.failed_count} failed, #{run.skipped_count} without a phone."
      Notification.create!(kind: "bill_run", title: "Bills for #{run.period_from.strftime('%B %Y')} #{run.trigger == 'auto' ? 'sent automatically' : 'sent'}", body: body, link: "/admin/customers/bills")
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

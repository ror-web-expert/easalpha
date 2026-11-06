module Customers
  # What happens after a bill's due date: a WhatsApp reminder a set number of days later (one per customer per bill
  # run, setting khata.overdue.remind_after_days) and, when khata.credit_hold_days is set, no new sales on account
  # while a bill is that many days overdue. Both read the bill runs, which record each customer's bill and due date.
  module Overdue
    module_function

    # Bills older than this are not dug up when the reminder is switched on; the next month's bill carries the balance.
    WINDOW = 31

    # The latest bill run that sent this customer a bill with a due date, with that customer's row.
    def last_bill(customer)
      run = BillRun.where(status: "done").where.not(due_on: nil).where("results @> ?::jsonb", [ { customer_id: customer.id, status: "sent" } ].to_json)
                   .order(period_to: :desc, created_at: :desc).first
      run && [ run, run.results.find { |r| r["customer_id"] == customer.id && r["status"] == "sent" } ]
    end

    # Days the customer's latest bill is past its due date and still not settled by payments since it went out;
    # nil without such a bill, before its due date, or once it is paid.
    def days_overdue(customer, today:)
      run, row = last_bill(customer)
      return nil unless run && today > run.due_on
      paid_since = CustomerPayment.where(customer_id: customer.id, direction: "received").where("business_day > ?", run.period_to).sum(:amount_minor)
      return nil if row["due_minor"].to_i - paid_since <= 0
      (today - run.due_on).to_i
    end

    # Refuses a sale on account when the customer's latest bill is overdue by more than the hold setting.
    def check_credit!(customer, business:, today:)
      hold = business.setting("khata.credit_hold_days").to_i
      return unless hold.positive?
      days = days_overdue(customer, today: today)
      return unless days && days > hold
      run, _row = last_bill(customer)
      raise Api::Errors::Conflict.new("khata.overdue", "#{customer.name}'s bill for #{run.period_to.strftime('%B %Y')} was due on #{run.due_on} and is #{days} days overdue")
    end

    # The daily job: everyone whose bill's due date passed the set number of days ago and who still owes at least the
    # bill-run minimum gets one reminder for that bill, through the customer's and guardian's phones like the bill.
    def remind!(business, today:)
      return unless BusinessModules.on?(business, "customer_accounts") && Whatsapp::Account.master_enabled?(business)
      after = business.setting("khata.overdue.remind_after_days").to_i
      return unless after.positive?
      min = [ business.setting("khata.monthly_bills.min_balance").to_i * 100, 1 ].max
      done = Set.new
      BillRun.where(status: "done").where(due_on: (today - after - WINDOW)..(today - after)).order(period_to: :desc, created_at: :desc).each do |run|
        run.results.each do |row|
          next unless row["status"] == "sent" && done.add?(row["customer_id"])
          customer = Customer.active.find_by(id: row["customer_id"]) or next
          next if customer.balance_minor < min || reminded?(run, customer)
          # Only the customer's latest bill is chased: a newer one carries this balance forward and gets its own turn.
          next unless last_bill(customer)&.first&.id == run.id
          Customers::Notify.overdue!(customer, run: run, today: today)
        rescue StandardError => e
          Rails.logger.error("[overdue] #{row['customer_id']}: #{e.class} #{e.message}")
        end
      end
    end

    # The reminder is recorded as the message it sent; a second pass for the same run sends nothing.
    def reminded?(run, customer)
      WhatsappMessage.where(business_id: run.business_id, customer_id: customer.id, template_name: "account_overdue").where("variables->>'bill_run_id' = ?", run.id).exists?
    end
  end
end

module Customers
  # What happens after a bill's due date: a WhatsApp reminder a set number of days later (setting
  # khata.overdue.remind_after_days, once per customer per bill) and, when khata.credit_hold_days is set, no new sales on
  # account while a bill is that many days overdue.
  #
  # A customer is judged by their real position (K12, ledger#1, ledger#5): what the bill for a period asked for is the
  # balance at the period's end as the ledger has it now (a payment dated back into the period counts), and what
  # settles it is every credit dated after the period (payments, refunds to the account, write-offs), oldest debt
  # first. The bills are the business's bill runs, every row of them whether WhatsApp delivered it or not; a business
  # that prints its bills has no runs, and its bills follow the monthly cycle in the settings (the bill day, and the
  # days a bill is due after it). Neither the judgement nor the hold needs WhatsApp; only the reminder does.
  module Overdue
    module_function

    # A bill whose reminder day is longer ago than this is not dug up when the reminder is switched on.
    WINDOW = 31
    # Bills looked at, newest first: twelve months of runs or of the cycle.
    LOOKBACK = 12

    # The bills a customer had, newest first: { period_from:, period_to:, due_on:, run: } (run nil for the cycle).
    def bills_for(customer, today:)
      return cycle(customer.business, today) unless runs?(today)
      runs = recent_runs(today).where("results @> ?::jsonb", [ { customer_id: customer.id } ].to_json).select(:id, :period_from, :period_to, :due_on, :created_at)
      from_runs(runs)
    end

    def runs?(today) = recent_runs(today).exists?
    def recent_runs(today) = BillRun.where.not(due_on: nil).where(period_to: (today << LOOKBACK)..).order(period_to: :desc, created_at: :desc)

    # One bill per period: a period billed twice keeps its newest run.
    def from_runs(runs)
      runs.uniq(&:period_to).map { |r| { period_from: r.period_from, period_to: r.period_to, due_on: r.due_on, run: r } }
    end

    # The monthly bills a business that prints them gives: each covers the calendar month before the bill day and is
    # due khata.monthly_bills.due_days after it. None when bills carry no due date.
    def cycle(business, today)
      due_days = business.setting("khata.monthly_bills.due_days").to_i
      return [] unless due_days.positive?
      day = business.setting("khata.monthly_bills.day").to_i.clamp(1, 28)
      last = today.day >= day ? today.change(day: day) : today.prev_month.change(day: day)
      Array.new(LOOKBACK) do |i|
        month = (last << i).prev_month
        { period_from: month.beginning_of_month, period_to: month.end_of_month, due_on: (last << i) + due_days, run: nil }
      end
    end

    # What each customer still owes of a bill for a period that ended on `after`.
    def unpaid(ids, after:)
      owed = Customers::Ledger.balances(ids, before: after + 1)
      paid = Customers::Ledger.account_payments(ids).where(direction: "received").where("customer_payments.business_day > ?", after).group(:customer_id).sum(:amount_minor)
      refunded = Customers::Ledger.khata_refunds(ids).where("refunds.business_day > ?", after).group("orders.customer_id").sum("refunds.amount_minor")
      written_off = Customers::Ledger.account_adjustments(ids).where("customer_adjustments.amount_minor < 0").where("customer_adjustments.effective_on > ?", after).group(:customer_id).sum(:amount_minor)
      ids.index_with { |id| owed[id].to_i - paid[id].to_i - refunded[id].to_i + written_off[id].to_i }
    end

    # The smallest amount bills chase (khata.monthly_bills.min_balance, in rupees, at least one): less is not billed,
    # so it is never overdue either.
    def minimum(business) = [ business.setting("khata.monthly_bills.min_balance").to_i * 100, 1 ].max

    # Where a customer stands: the newest bill past its due date with at least the minimum still unpaid, what is unpaid
    # of it, and the oldest bill still unpaid, whose due date the days overdue count from. nil when nothing billed is
    # overdue. deep: false stops at the newest bill (the reminder); enough: days stops looking further back once the
    # customer is that many days overdue (the hold).
    def position(customer, today:, bills: nil, deep: true, enough: nil)
      min = minimum(customer.business)
      return nil if customer.balance_minor < min # what is unpaid of a bill never exceeds the balance
      past = (bills || bills_for(customer, today: today)).select { |b| today > b[:due_on] }
      return nil if past.empty?
      latest = past.first
      owed = unpaid([ customer.id ], after: latest[:period_to])[customer.id]
      return nil if owed < min
      oldest = latest
      if deep
        past.drop(1).each do |b|
          break if enough && (today - oldest[:due_on]).to_i > enough
          break if unpaid([ customer.id ], after: b[:period_to])[customer.id] < min
          oldest = b
        end
      end
      { bill: latest, unpaid_minor: owed, oldest: oldest, days_overdue: (today - oldest[:due_on]).to_i }
    end

    def days_overdue(customer, today:) = position(customer, today: today)&.dig(:days_overdue)

    # Refuses a sale on account while a bill is overdue by more than the hold setting.
    def check_credit!(customer, business:, today:)
      hold = business.setting("khata.credit_hold_days").to_i
      return unless hold.positive?
      pos = position(customer, today: today, enough: hold)
      return unless pos && pos[:days_overdue] > hold
      bill = pos[:oldest]
      raise Api::Errors::Conflict.new("khata.overdue", "#{customer.name}'s bill for #{bill[:period_to].strftime('%B %Y')} was due on #{bill[:due_on]} and is #{pos[:days_overdue]} days overdue")
    end

    # The daily job: everyone whose newest bill past its due date is still unpaid, the set number of days after that
    # date, gets one reminder for that bill with the amount still unpaid, through the customer's and guardian's phones
    # like the bill. Someone who paid it gets nothing, whatever they have bought since.
    def remind!(business, today:)
      return unless BusinessModules.on?(business, "customer_accounts") && Whatsapp::Account.master_enabled?(business)
      after = business.setting("khata.overdue.remind_after_days").to_i
      return unless after.positive?
      # Like the bills: with no phone linked a message would only be stored and count as sent, so wait for tomorrow.
      return unless Whatsapp::Provider.live?(business)
      runs = recent_runs(today).to_a
      cycle = runs.empty? ? cycle(business, today) : nil
      Customer.active.where(is_walk_in: false).where("balance_minor >= ?", minimum(business)).find_each do |customer|
        bills = cycle || from_runs(runs.select { |r| r.results.any? { |row| row["customer_id"] == customer.id } })
        pos = position(customer, today: today, bills: bills, deep: false) or next
        bill = pos[:bill]
        next unless (today - bill[:due_on]).to_i.between?(after, after + WINDOW) && !reminded?(customer, bill)
        Customers::Notify.overdue!(customer, bill: bill, unpaid_minor: pos[:unpaid_minor], today: today)
      rescue StandardError => e
        Rails.logger.error("[overdue] #{customer.id}: #{e.class} #{e.message}")
      end
    end

    # The reminder is recorded as the message it sent, by its bill run or, for a printed bill, its period: a second
    # pass for the same bill sends nothing.
    def reminded?(customer, bill)
      sent = WhatsappMessage.where(business_id: customer.business_id, customer_id: customer.id, template_name: "account_overdue")
      bill[:run] ? sent.where("variables->>'bill_run_id' = ?", bill[:run].id).exists? : sent.where("variables->>'bill_period_to' = ?", bill[:period_to].to_s).exists?
    end
  end
end

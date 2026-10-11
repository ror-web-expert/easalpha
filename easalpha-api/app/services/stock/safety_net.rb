module Stock
  # SPEC safety net: the till deducts once, at completion. If that call is lost, a job every ten minutes finds completed
  # orders whose stock never moved and deducts them dated to the day the order was sold, never twice.
  module SafetyNet
    INTERVAL = 10.minutes
    LOOKBACK = 14.days
    module_function

    # Completed orders of this business with no stock movement yet.
    def candidates
      Order.where(status: %w[paid closed]).where(stock_deducted_at: nil).where("orders.business_day >= ?", (Date.current - LOOKBACK))
           .where.not(id: StockLedgerEntry.where(ref_table: "orders", kind: %w[sale packaging]).select(:ref_id))
    end

    def sweep!(trigger: "job", by: nil)
      run = SafetyNetRun.new(trigger: trigger, by_membership_id: by&.id, ran_at: Time.current)
      return run.tap { |r| r.detail = { reason: "deduct_stock_on_sale is off" }; r.save! } unless Deduction.enabled?
      problems = []
      candidates.includes(items: :modifiers).find_each do |order|
        run.checked += 1
        begin
          audit = Deduction.deduct!(order, actor: nil)
          run.deducted += 1 if audit.ledger_entry_ids.any?
        rescue StandardError => e
          run.errors_count += 1
          problems << { order_id: order.id, label: order.label, error: e.message }
        end
      end
      run.detail = { problems: problems.first(50) }
      run.save!
      run
    end

    def status
      last = SafetyNetRun.order(ran_at: :desc).first
      { enabled: Deduction.enabled?, interval_minutes: INTERVAL / 60, lookback_days: LOOKBACK / 1.day,
        last_run_at: last&.ran_at, last_trigger: last&.trigger, last_checked: last&.checked, last_deducted: last&.deducted, last_errors: last&.errors_count,
        next_run_at: last ? last.ran_at + INTERVAL : nil, running: last.present? && last.ran_at > INTERVAL * 2 + 1.minute ? false : last.present?,
        pending: candidates.count }
    end
  end
end

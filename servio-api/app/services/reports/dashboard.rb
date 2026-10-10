module Reports
  # The owner's one-minute view: today against the same day last week, open orders apart from revenue, and what needs attention.
  module Dashboard
    module_function

    def build(branch, day = nil)
      day ||= branch.business_day_for(Time.current)
      today = Sales.new(branch: branch, from: day, to: day).overview
      last_week = Sales.new(branch: branch, from: day - 7, to: day - 7).overview
      yesterday = Sales.new(branch: branch, from: day - 1, to: day - 1).overview
      month = Sales.new(branch: branch, from: day.beginning_of_month, to: day).overview
      last_month = Sales.new(branch: branch, from: (day - 1.month).beginning_of_month, to: day - 1.month).overview
      {
        business_day: day,
        today: today, yesterday: yesterday.slice(:orders, :revenue_minor), same_day_last_week: last_week.slice(:orders, :revenue_minor),
        month_to_date: month.slice(:orders, :revenue_minor, :discount_minor), same_period_last_month: last_month.slice(:orders, :revenue_minor),
        change_vs_last_week_percent: pct(today[:revenue_minor], last_week[:revenue_minor]), change_vs_yesterday_percent: pct(today[:revenue_minor], yesterday[:revenue_minor]),
        open_orders: today[:open], open_minor: today[:open_minor],
        shifts_open: Shift.open.where(branch_id: branch.id).count,
        day_locked: DayClose.locked?(branch.id, day),
        tax_queue: Tax::Invoicer.queue_summary(branch_id: branch.id).slice(:queued, :failed),
        needs_attention: SyncRejection.open.where(branch_id: branch.id).count,
        khata_outstanding_minor: Customer.active.where("balance_minor > 0").sum(:balance_minor),
        stock: { negative_items: StockLevel.where("quantity < 0").distinct.count(:stock_item_id),
                 below_minimum_items: StockItem.active.where("minimum_qty > 0").select { |i| i.below_minimum? }.size,
                 value_minor: StockLevel.sum(:value_minor) },
        top_items: Sales.new(branch: branch, from: day - 6, to: day).items(limit: 5),
        recent_orders: Order.where(branch_id: branch.id).order(created_at: :desc).limit(8).map { |o| OrderSerializers.summary(o) },
        trend_7_days: Sales.new(branch: branch, from: day - 6, to: day).by_day,
        checklist: SetupChecklistItem.order(:sort_order).map { |i| { key: i.key, done: i.done_at.present? } },
        low_stock: nil
      }
    end

    def pct(now, before)
      return nil if before.to_i.zero?
      ((now - before) * 100.0 / before).round(1)
    end
  end
end

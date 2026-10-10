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

    # SPEC dashboard: KPI cards and charts for a period (today, yesterday, 7d, 30d, month, or from..to).
    def spec(branch, period: "today", from: nil, to: nil)
      today = branch.business_day_for(Time.current)
      from, to = case period.to_s
                 when "yesterday" then [today - 1, today - 1]
                 when "7d" then [today - 6, today]
                 when "30d" then [today - 29, today]
                 when "month" then [today.beginning_of_month, today]
                 when "custom" then [Date.parse(from.to_s), Date.parse(to.to_s)]
                 else [today, today]
                 end
      orders = Order.where(branch_id: branch.id, business_day: from..to).where.not(status: %w[draft held])
      completed = orders.where(status: %w[paid closed])
      open = orders.open
      sales = Sales.new(branch: branch, from: from, to: to)
      status_counts = orders.group(:status).count
      {
        period: period, from: from, to: to,
        cards: {
          total_products: Product.where(archived_at: nil, active: true).count,
          total_revenue_minor: completed.sum(:total_minor),
          open_minor: open.sum(:total_minor),
          incl_open_minor: completed.sum(:total_minor) + open.sum(:total_minor),
          total_orders: orders.count, cancelled_orders: orders.where(status: %w[voided refunded]).count,
          total_customers: Customer.active.where(is_walk_in: false).count,
          expenses_minor: Expense.live.where(branch_id: branch.id, business_day: from..to).sum(:amount_minor)
        },
        charts: {
          sales_by_hour: sales.by_hour,
          products_by_category: Product.where(archived_at: nil, active: true).joins(:category).group("categories.name").count.map { |k, v| { category: k, products: v } },
          order_status: Orders::SpecStatus::STATUS_MAP.map { |name, internal| { status: name, orders: internal.sum { |s| status_counts[s].to_i } } },
          expenses_by_category: Expenses.summary(branch: branch, from: from, to: to)[:by_category]
        },
        top_selling: sales.items(limit: 10),
        pills: pills(branch)
      }
    end

    # SPEC top bar: a low-stock pill and an open-orders pill reading "N open orders today · M from previous days".
    def pills(branch)
      today = branch.business_day_for(Time.current)
      open = Order.open.where(branch_id: branch.id).where.not(status: "draft")
      low = StockItem.active.where("minimum_qty > 0").joins("LEFT JOIN stock_levels sl ON sl.stock_item_id = stock_items.id")
                     .group("stock_items.id").having("COALESCE(SUM(sl.quantity), 0) <= stock_items.minimum_qty").count.size
      { open_orders_today: open.where(business_day: today).count, open_orders_previous: open.where("business_day < ?", today).count, low_stock_items: low }
    end

    def pct(now, before)
      return nil if before.to_i.zero?
      ((now - before) * 100.0 / before).round(1)
    end
  end
end

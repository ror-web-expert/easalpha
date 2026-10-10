module Reports
  # SPEC report catalogue additions: Grand Report shares, Sales detail, Sales Calendar, Operations, Loyalty Points.
  module Catalogue
    module_function

    # Grand Report: every payment method with count and share, Unpaid and Complimentary as a share of sales, plus
    # payments received against customer accounts.
    def grand(branch:, from:, to:)
      paid = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded])
      payments = Payment.where(branch_id: branch.id, business_day: from..to, status: "captured")
      sales = paid.sum(:total_minor)
      methods = payments.group(:method_code).pluck(Arel.sql("method_code, count(*), sum(amount_minor)")).map do |code, c, amt|
        { method: code, count: c, amount_minor: amt.to_i, share_percent: sales.zero? ? 0 : (amt.to_i * 100.0 / sales).round(1) }
      end.sort_by { |r| -r[:amount_minor] }
      unpaid = Order.where(branch_id: branch.id, business_day: from..to).where(status: %w[placed preparing ready served]).where("paid_minor < total_minor")
      unpaid_direct = Order.where(branch_id: branch.id, business_day: from..to, unpaid_direct: true)
      complimentary = Order.where(branch_id: branch.id, business_day: from..to, is_staff_meal: true)
      account_receipts = CustomerPayment.where(branch_id: branch.id, business_day: from..to, direction: "received")
      { from: from, to: to, sales_minor: sales, orders: paid.count, methods: methods, methods_total_minor: methods.sum { |m| m[:amount_minor] },
        unpaid: { count: unpaid.count + unpaid_direct.where.not(id: unpaid.select(:id)).count, amount_minor: unpaid_amount(unpaid) + unpaid_amount(unpaid_direct.where.not(id: unpaid.select(:id))),
                  share_percent: sales.zero? ? 0 : (unpaid_amount(unpaid) * 100.0 / sales).round(1) },
        complimentary: { count: complimentary.count, amount_minor: complimentary.sum(:subtotal_minor), share_percent: sales.zero? ? 0 : (complimentary.sum(:subtotal_minor) * 100.0 / sales).round(1) },
        account_receipts: { count: account_receipts.count, amount_minor: account_receipts.sum(:amount_minor), by_method: account_receipts.joins(:payment_method).group("payment_methods.code").sum(:amount_minor) },
        on_account_minor: payments.where(method_code: "khata").sum(:amount_minor) }
    end

    def unpaid_amount(scope) = scope.sum("total_minor - paid_minor").to_i

    # Sales: the detail table, one row per order.
    def sales_detail(branch:, from:, to:, cursor: nil, limit: nil, order_type: nil, source: nil)
      scope = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded]).includes(:customer).order(placed_at: :desc, created_at: :desc)
      scope = scope.where(order_type: order_type) if order_type.present?
      scope = scope.where(source: source) if source.present?
      rows, next_cursor = Paginator.call(scope, cursor: cursor, limit: limit || 100, order_column: :created_at)
      names = Membership.unscoped.includes(:user).where(id: rows.map { |o| [o.taken_by_membership_id, o.completed_by_membership_id] }.flatten.compact.uniq).index_by(&:id)
      { data: rows.map { |o| { id: o.id, label: o.label, business_day: o.business_day, placed_at: o.placed_at, order_type: o.order_type, source: o.source, status: o.spec_status, payment_status: o.spec_payment_status,
                                 customer: o.customer&.name, taken_by: names[o.taken_by_membership_id]&.user&.name, completed_by: names[o.completed_by_membership_id]&.user&.name, items: o.items.count { |i| !i.cancelled? },
                                 subtotal_minor: o.subtotal_minor, discount_minor: o.discount_minor, tax_minor: o.tax_minor, service_charge_minor: o.service_charge_minor, delivery_charge_minor: o.delivery_charge_minor,
                                 total_minor: o.total_minor, payment_method_summary: o.payment_method_summary } },
        next_cursor: next_cursor, totals: { orders: scope.count, revenue_minor: scope.sum(:total_minor), discount_minor: scope.sum(:discount_minor), tax_minor: scope.sum(:tax_minor) } }
    end

    # Sales Calendar: day by day for a month, in a grid the screen can draw.
    def calendar(branch:, month:)
      from, to = month.beginning_of_month, month.end_of_month
      paid = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded])
      by_day = paid.group(:business_day).pluck(Arel.sql("business_day, count(*), sum(total_minor)")).to_h { |d, c, t| [d, { orders: c, revenue_minor: t.to_i }] }
      days = (from..to).map { |d| { date: d, wday: d.wday, orders: by_day.dig(d, :orders) || 0, revenue_minor: by_day.dig(d, :revenue_minor) || 0 } }
      best = days.max_by { |d| d[:revenue_minor] }
      { month: from, days: days, totals: { orders: days.sum { |d| d[:orders] }, revenue_minor: days.sum { |d| d[:revenue_minor] }, average_day_minor: days.count { |d| d[:orders].positive? }.then { |n| n.zero? ? 0 : days.sum { |d| d[:revenue_minor] } / n },
                                            best_day: best && best[:revenue_minor].positive? ? best[:date] : nil } }
    end

    # Operations: throughput. Orders per hour, time to ready, time to complete, delivery time, cancelled and modified.
    def operations(branch:, from:, to:)
      all = Order.where(branch_id: branch.id, business_day: from..to)
      paid = all.where(status: %w[paid closed refunded])
      prep = paid.where.not(placed_at: nil).where.not(ready_at: nil).pluck(:placed_at, :ready_at).map { |a, b| (b - a) / 60 }
      complete = paid.where.not(placed_at: nil).where.not(closed_at: nil).pluck(:placed_at, :closed_at).map { |a, b| (b - a) / 60 }
      deliveries = Delivery.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to }, status: "delivered").where.not(assigned_at: nil).where.not(delivered_at: nil).pluck(:assigned_at, :delivered_at).map { |a, b| (b - a) / 60 }
      by_hour = paid.where.not(placed_at: nil).group(Arel.sql("EXTRACT(HOUR FROM placed_at AT TIME ZONE '#{branch.time_zone}')")).count.transform_keys(&:to_i)
      days = (to - from).to_i + 1
      items = OrderItem.joins(:order).where(orders: { id: paid.select(:id) }).where.not(status: "cancelled").sum(:quantity)
      { from: from, to: to, orders: paid.count, orders_per_day: (paid.count.to_f / days).round(1), items_per_order: paid.count.zero? ? 0 : (items / paid.count).round(2),
        avg_prep_minutes: avg(prep), avg_complete_minutes: avg(complete), avg_delivery_minutes: avg(deliveries), peak_hour: by_hour.max_by { |_, c| c }&.first,
        by_hour: (0..23).map { |h| { hour: h, orders: by_hour[h] || 0 } }, cancelled: all.where(status: "voided").count, modified: all.where("edit_count > 0").count, reopened: all.where("reopen_count > 0").count,
        by_type: paid.group(:order_type).count, by_source: paid.group(:source).count, tables_turned: paid.where.not(table_id: nil).count }
    end

    def avg(list) = list.empty? ? nil : (list.sum / list.size).round(1)

    # Loyalty Points: issued and redeemed over the period, by day and by customer.
    def loyalty_points(branch:, from:, to:)
      scope = LoyaltyTransaction.where(occurred_at: from.beginning_of_day..to.end_of_day)
      issued = scope.where(kind: "earn").sum(:points)
      redeemed = -scope.where(kind: "redeem").sum(:points)
      by_day = scope.group(Arel.sql("DATE(occurred_at)"), :kind).sum(:points).each_with_object(Hash.new { |h, k| h[k] = { issued: 0, redeemed: 0, adjusted: 0 } }) do |((d, k), pts), h|
        key = k == "earn" ? :issued : (k == "redeem" ? :redeemed : :adjusted)
        h[d.to_date][key] += k == "redeem" ? -pts : pts
      end
      top = scope.group(:customer_id).sum(:points).sort_by { |_, p| -p }.first(20)
      customers = Customer.where(id: top.map(&:first)).index_by(&:id)
      { from: from, to: to, issued: issued, redeemed: redeemed, adjusted: scope.where(kind: %w[adjust refund expire]).sum(:points), outstanding: Customer.active.sum(:loyalty_points),
        redeemed_value_minor: DiscountApplied.joins(:order).where(kind: "loyalty", orders: { branch_id: branch.id, business_day: from..to }).sum(:amount_minor),
        by_day: by_day.sort.map { |d, v| { date: d }.merge(v) }, top_customers: top.map { |id, p| { customer_id: id, name: customers[id]&.name, points: p } },
        options: LoyaltyRedemptionOption.active.map { |o| MarketingSerializers.redemption_option(o) } }
    end
  end
end

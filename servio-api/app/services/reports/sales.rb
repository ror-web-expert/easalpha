module Reports
  # Every report reads paid orders (paid, closed, refunded) for a branch and a business-day range. Money in minor units.
  class Sales
    attr_reader :branch, :from, :to

    def initialize(branch:, from:, to:)
      @branch, @from, @to = branch, from, to
    end

    def paid = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded])
    def all = Order.where(branch_id: branch.id, business_day: from..to)
    def payments = Payment.where(branch_id: branch.id, business_day: from..to, status: "captured")

    def overview
      p = paid
      count = p.count
      { from: from, to: to, orders: count, revenue_minor: p.sum(:total_minor), subtotal_minor: p.sum(:subtotal_minor), discount_minor: p.sum(:discount_minor),
        tax_minor: p.sum(:tax_minor), service_charge_minor: p.sum(:service_charge_minor), tips_minor: p.sum(:tip_minor), refunds_minor: Refund.where(branch_id: branch.id, business_day: from..to).sum(:amount_minor),
        average_order_minor: count.zero? ? 0 : p.sum(:total_minor) / count, voided: all.where(status: "voided").count, voided_minor: all.where(status: "voided").sum(:total_minor),
        staff_meals: all.where(is_staff_meal: true).count, open: all.open.count, open_minor: all.open.sum(:total_minor),
        by_payment_method: payments.group(:method_code).sum(:amount_minor), by_order_type: p.group(:order_type).sum(:total_minor), by_source: p.group(:source).sum(:total_minor),
        customers: p.where.not(customer_id: nil).distinct.count(:customer_id) }
    end

    def by_day
      rows = paid.group(:business_day).pluck(Arel.sql("business_day, count(*), sum(total_minor), sum(discount_minor), sum(tax_minor)"))
      rows.sort_by(&:first).map { |d, c, t, disc, tax| { business_day: d, orders: c, revenue_minor: t.to_i, discount_minor: disc.to_i, tax_minor: tax.to_i } }
    end

    def by_hour
      tz = ActiveRecord::Base.connection.quote(branch.time_zone)
      hour_sql = "extract(hour from (paid_at at time zone 'UTC') at time zone #{tz})"
      rows = paid.group(Arel.sql(hour_sql)).pluck(Arel.sql("#{hour_sql}, count(*), sum(total_minor)"))
      (0..23).map { |h| r = rows.find { |x| x[0].to_i == h }; { hour: h, orders: r ? r[1] : 0, revenue_minor: r ? r[2].to_i : 0 } }
    end

    def items(limit: 50)
      rows = OrderItem.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded] }).where.not(status: "cancelled")
                      .group(:product_id, :deal_id, :name_snapshot).pluck(Arel.sql("product_id, deal_id, name_snapshot, sum(quantity), sum(line_total_minor), sum(line_discount_minor), count(distinct order_id)"))
      rows.map { |pid, did, name, qty, total, disc, orders| { product_id: pid, deal_id: did, name: name, quantity: qty.to_f, revenue_minor: total.to_i, discount_minor: disc.to_i, orders: orders } }
          .sort_by { |r| -r[:revenue_minor] }.first(limit)
    end

    def categories
      rows = OrderItem.joins(:order).joins("LEFT JOIN products ON products.id = order_items.product_id").joins("LEFT JOIN categories ON categories.id = products.category_id")
                      .where(orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded] }).where.not(order_items: { status: "cancelled" })
                      .group("categories.id", "categories.name").pluck(Arel.sql("categories.id, coalesce(categories.name, 'Deals and open items'), sum(order_items.quantity), sum(order_items.line_total_minor)"))
      rows.map { |id, name, qty, total| { category_id: id, name: name, quantity: qty.to_f, revenue_minor: total.to_i } }.sort_by { |r| -r[:revenue_minor] }
    end

    def cashiers
      names = Membership.unscoped.includes(:user).where(id: paid.distinct.pluck(:completed_by_membership_id, :taken_by_membership_id).flatten.compact).index_by(&:id)
      rows = paid.group(:completed_by_membership_id).pluck(Arel.sql("completed_by_membership_id, count(*), sum(total_minor), sum(discount_minor)"))
      rows.map { |mid, c, t, d| { membership_id: mid, name: names[mid]&.user&.name, orders: c, revenue_minor: t.to_i, discount_minor: d.to_i,
                                   voids: all.where(status: "voided").joins(:voids).where(voids: { by_membership_id: mid }).count } }.sort_by { |r| -r[:revenue_minor] }
    end

    def order_takers
      names = Membership.unscoped.includes(:user).where(id: all.distinct.pluck(:taken_by_membership_id).compact).index_by(&:id)
      paid.group(:taken_by_membership_id).pluck(Arel.sql("taken_by_membership_id, count(*), sum(total_minor)")).map { |mid, c, t| { membership_id: mid, name: names[mid]&.user&.name, orders: c, revenue_minor: t.to_i } }.sort_by { |r| -r[:revenue_minor] }
    end

    def voids
      rows = Void.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to }).includes(:order).order(voided_at: :desc)
      names = Membership.unscoped.includes(:user).where(id: rows.map { |v| [ v.by_membership_id, v.approved_by_membership_id ] }.flatten.compact.uniq).index_by(&:id)
      { count: rows.count, amount_minor: rows.sum(:amount_minor),
        rows: rows.map { |v| { order_id: v.order_id, label: v.order.label, amount_minor: v.amount_minor, reason: v.reason, stock_action: v.stock_action, by: names[v.by_membership_id]&.user&.name, approved_by: names[v.approved_by_membership_id]&.user&.name, at: v.voided_at } } }
    end

    def discounts
      rows = DiscountApplied.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed refunded] }).includes(:order).order(created_at: :desc)
      names = Membership.unscoped.includes(:user).where(id: rows.map { |d| [ d.applied_by_membership_id, d.approved_by_membership_id ] }.flatten.compact.uniq).index_by(&:id)
      { count: rows.count, amount_minor: rows.sum(:amount_minor), by_reason: rows.reorder(nil).group(:reason).sum(:amount_minor),
        rows: rows.first(200).map { |d| { order_id: d.order_id, label: d.order.label, kind: d.kind, value: d.value.to_f, amount_minor: d.amount_minor, reason: d.reason, by: names[d.applied_by_membership_id]&.user&.name, approved_by: names[d.approved_by_membership_id]&.user&.name, at: d.created_at } } }
    end

    def modified
      ids = KitchenTicket.where(branch_id: branch.id, kind: %w[changed cancelled]).joins(:order).where(orders: { business_day: from..to }).distinct.pluck(:order_id)
      Order.where(id: ids).includes(:kitchen_tickets).order(placed_at: :desc).map { |o| { order_id: o.id, label: o.label, status: o.status, total_minor: o.total_minor, tickets: o.kitchen_tickets.map { |t| { kind: t.kind, at: t.created_at, lines: t.lines.map { |l| l["name"] } } } } }
    end

    def customers(limit: 50)
      rows = paid.where.not(customer_id: nil).group(:customer_id).pluck(Arel.sql("customer_id, count(*), sum(total_minor), max(paid_at)"))
      custs = Customer.where(id: rows.map(&:first)).index_by(&:id)
      rows.map { |cid, c, t, last| cu = custs[cid]; { customer_id: cid, name: cu&.name, phone: cu&.phone, orders: c, revenue_minor: t.to_i, last_order_at: last, balance_minor: cu&.balance_minor } }.sort_by { |r| -r[:revenue_minor] }.first(limit)
    end

    def shifts
      Shift.where(branch_id: branch.id, business_day: from..to).order(opened_at: :desc).map { |s| ShiftSerializers.shift(s, with_expected: true).merge(cashier: Membership.unscoped.includes(:user).find_by(id: s.cashier_membership_id)&.user&.name, net_sales_minor: s.z_report.dig("sales", "net_minor")) }
    end
  end
end

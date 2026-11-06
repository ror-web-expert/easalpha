module Reports
  # Every report reads one branch and a business-day range. Money in minor units. Revenue, tax and the order counts
  # follow Reports::Revenue: sales on their order's day, refunds on their own day. Line and category figures are the
  # lines of paid and closed orders, gross of partial refunds (a refund is an amount on the order, not on a line), and
  # leave staff meals out: their lines carry menu prices the order never charged.
  class Sales
    attr_reader :branch, :from, :to

    def initialize(branch:, from:, to:)
      @branch, @from, @to = branch, from, to
    end

    def revenue = @revenue ||= Revenue.period(branch: branch, from: from, to: to)
    def paid = revenue.orders
    def all = Order.where(branch_id: branch.id, business_day: from..to)
    def payments = Payment.where(branch_id: branch.id, business_day: from..to, status: "captured")
    # Lines that were sold: paid and closed orders, staff meals left out.
    def sold_lines = OrderItem.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to, status: %w[paid closed], is_staff_meal: false }).where.not(status: "cancelled")

    def overview
      t = revenue.totals
      count = t[:orders]
      revenue_minor = t[:revenue_minor]
      { from: from, to: to, orders: count, revenue_minor: revenue_minor, subtotal_minor: t[:subtotal_minor], discount_minor: t[:discount_minor],
        tax_minor: t[:tax_minor], service_charge_minor: t[:parts][:service_charge], tips_minor: t[:tips_minor], refunds_minor: t[:refunds_minor],
        average_order_minor: count.zero? ? 0 : revenue_minor / count, voided: all.where(status: "voided").count, voided_minor: all.where(status: "voided").sum(:total_minor),
        staff_meals: all.where(is_staff_meal: true).count, open: all.open.count, open_minor: all.open.sum(:total_minor),
        by_payment_method: payments.group(:method_code).sum(:amount_minor), by_order_type: revenue.grouped(:order_type).transform_values { |r| r[:revenue_minor] },
        by_source: revenue.grouped(:source).transform_values { |r| r[:revenue_minor] }, customers: paid.where.not(customer_id: nil).distinct.count(:customer_id) }
    end

    def by_day
      revenue.grouped(:business_day).sort_by(&:first).map { |d, r| { business_day: d }.merge(r) }
    end

    # By the hour the order was settled (paid, or closed without a payment), in the branch's own zone.
    def by_hour
      rows = revenue.grouped(:hour, tz: branch.time_zone)
      (0..23).map { |h| { hour: h, orders: rows.dig(h, :orders) || 0, revenue_minor: rows.dig(h, :revenue_minor) || 0 } }
    end

    def items(limit: 50)
      rows = sold_lines.group(:product_id, :deal_id, :name_snapshot).pluck(Arel.sql("product_id, deal_id, name_snapshot, sum(quantity), sum(line_total_minor), sum(line_discount_minor), count(distinct order_id)"))
      rows.map { |pid, did, name, qty, total, disc, orders| { product_id: pid, deal_id: did, name: name, quantity: qty.to_f, revenue_minor: total.to_i, discount_minor: disc.to_i, orders: orders } }
          .sort_by { |r| -r[:revenue_minor] }.first(limit)
    end

    def categories
      rows = sold_lines.joins("LEFT JOIN products ON products.id = order_items.product_id").joins("LEFT JOIN categories ON categories.id = products.category_id")
                       .group("categories.id", "categories.name").pluck(Arel.sql("categories.id, coalesce(categories.name, 'Deals and open items'), sum(order_items.quantity), sum(order_items.line_total_minor)"))
      rows.map { |id, name, qty, total| { category_id: id, name: name, quantity: qty.to_f, revenue_minor: total.to_i } }.sort_by { |r| -r[:revenue_minor] }
    end

    def cashiers
      rows = revenue.grouped(:completed_by_membership_id)
      names = Membership.unscoped.includes(:user).where(id: rows.keys.compact).index_by(&:id)
      rows.map { |mid, r| { membership_id: mid, name: names[mid]&.user&.name, orders: r[:orders], revenue_minor: r[:revenue_minor], discount_minor: r[:discount_minor],
                            voids: all.where(status: "voided").joins(:voids).where(voids: { by_membership_id: mid }).count } }.sort_by { |r| -r[:revenue_minor] }
    end

    def order_takers
      rows = revenue.grouped(:taken_by_membership_id)
      names = Membership.unscoped.includes(:user).where(id: rows.keys.compact).index_by(&:id)
      rows.map { |mid, r| { membership_id: mid, name: names[mid]&.user&.name, orders: r[:orders], revenue_minor: r[:revenue_minor] } }.sort_by { |r| -r[:revenue_minor] }
    end

    def voids
      rows = Void.joins(:order).where(orders: { branch_id: branch.id, business_day: from..to }).includes(:order).order(voided_at: :desc)
      names = Membership.unscoped.includes(:user).where(id: rows.map { |v| [ v.by_membership_id, v.approved_by_membership_id ] }.flatten.compact.uniq).index_by(&:id)
      { count: rows.count, amount_minor: rows.sum(:amount_minor),
        rows: rows.map { |v| { order_id: v.order_id, label: v.order.label, amount_minor: v.amount_minor, reason: v.reason, stock_action: v.stock_action, by: names[v.by_membership_id]&.user&.name, approved_by: names[v.approved_by_membership_id]&.user&.name, at: v.voided_at } } }
    end

    # The discounts of the period's sales, the overview's discount figure.
    def discounts
      rows = DiscountApplied.joins(:order).merge(paid).includes(:order).order(created_at: :desc)
      names = Membership.unscoped.includes(:user).where(id: rows.map { |d| [ d.applied_by_membership_id, d.approved_by_membership_id ] }.flatten.compact.uniq).index_by(&:id)
      { count: rows.count, amount_minor: rows.sum(:amount_minor), by_reason: rows.reorder(nil).group(:reason).sum(:amount_minor),
        rows: rows.first(200).map { |d| { order_id: d.order_id, label: d.order.label, kind: d.kind, value: d.value.to_f, amount_minor: d.amount_minor, reason: d.reason, by: names[d.applied_by_membership_id]&.user&.name, approved_by: names[d.approved_by_membership_id]&.user&.name, at: d.created_at } } }
    end

    def modified
      ids = KitchenTicket.where(branch_id: branch.id, kind: %w[changed cancelled]).joins(:order).where(orders: { business_day: from..to }).distinct.pluck(:order_id)
      Order.where(id: ids).includes(:kitchen_tickets).order(placed_at: :desc).map { |o| { order_id: o.id, label: o.label, status: o.status, total_minor: o.total_minor, tickets: o.kitchen_tickets.map { |t| { kind: t.kind, at: t.created_at, lines: t.lines.map { |l| l["name"] } } } } }
    end

    def customers(limit: 50)
      rows = revenue.grouped(:customer_id).except(nil)
      last = paid.where(customer_id: rows.keys).group(:customer_id).maximum(:paid_at)
      custs = Customer.where(id: rows.keys).index_by(&:id)
      rows.map { |cid, r| cu = custs[cid]; { customer_id: cid, name: cu&.name, phone: cu&.phone, orders: r[:orders], revenue_minor: r[:revenue_minor], last_order_at: last[cid], balance_minor: cu&.balance_minor } }
          .sort_by { |r| -r[:revenue_minor] }.first(limit)
    end

    # Each shift's sales, its refunds and its net sales after them, by the one revenue rule: a sale in the shift that
    # took its order, a refund in the shift that gave it back, and money handed back on an open order no refund. The Z
    # report's own net is before refunds, which it lists on a line of their own; an open shift has none stored yet.
    def shifts(only_membership_id: nil)
      scope = Shift.where(branch_id: branch.id, business_day: from..to)
      scope = scope.where(cashier_membership_id: only_membership_id) if only_membership_id
      rows = scope.order(opened_at: :desc).to_a
      ids = rows.map(&:id)
      sales = Revenue.sold(Order.where(shift_id: ids)).group(:shift_id).sum(:total_minor)
      refunds = Revenue.refund_lines(Refund.where(shift_id: ids).joins(:order)).group_by { |l| l.refund.shift_id }.transform_values { |lines| lines.sum(&:revenue_minor) }
      rows.map do |s|
        sold, back = sales[s.id].to_i, refunds[s.id].to_i
        ShiftSerializers.shift(s, with_expected: true).merge(cashier: Membership.unscoped.includes(:user).find_by(id: s.cashier_membership_id)&.user&.name,
                                                             sales_minor: sold, refunds_minor: back, net_sales_minor: sold - back)
      end
    end
  end
end

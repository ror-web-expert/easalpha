module Reports
  # The one revenue rule (review of 6 Nov 2026; its dating settled in the final round). The sales reports, the
  # dashboard, the branch comparison, commissions, the stock report, the profit and loss and the day close all read
  # it, so they agree with each other and with the journal:
  # - A sale counts on its order's business day at the order's total: a paid or closed order, or one refunded since
  #   (status refunded), which was a sale on its day. A staff meal charges nothing and is no sale.
  # - A refund counts on its own business day, the day the money went back, which is the day the journal books it. A
  #   later refund never rewrites an earlier or locked day; over days that hold both, a fully refunded order is zero.
  # - The part of a refund that only gives back what a reopened order was paid above its new total is no revenue: the
  #   total already went down when the order was edited.
  # - A refund takes back tax, service charge, delivery charge, tips and rounding in the shares Finance::Journal splits
  #   it into, so the tax here is the Tax Payable movement and the income the sales accounts' movement.
  # Two cases the journal books on other terms, which the profit and loss lists among the other entries in the books:
  # an order completed unpaid (Direct Unpaid Orders) is a sale here and nothing in the journal until it is paid, and a
  # payment taken on another business day than its order's is booked on the payment's day.
  module Revenue
    SOLD = %w[paid closed refunded].freeze
    PARTS = %i[sales tax service_charge delivery_charge tip rounding].freeze
    INCOME = %i[sales service_charge delivery_charge rounding].freeze
    # Each part of the sold orders' totals as Finance::Journal.sale_parts splits one; an order with nothing to pay has none.
    PART_SQL = { sales: "total_minor - tax_minor - service_charge_minor - delivery_charge_minor - tip_minor - rounding_minor", tax: "tax_minor", service_charge: "service_charge_minor",
                 delivery_charge: "delivery_charge_minor", tip: "tip_minor", rounding: "rounding_minor" }.transform_values { |c| "SUM(CASE WHEN orders.total_minor > 0 THEN #{c} ELSE 0 END)" }.freeze

    RefundLine = Struct.new(:refund, :order, :business_day, :revenue_minor, :parts, keyword_init: true)

    module_function

    def sold(orders) = orders.where(status: SOLD, is_staff_meal: false)

    # One branch's period, optionally narrowed by order columns (order_type: "delivery").
    def period(branch:, from:, to:, **where) = Period.new(branch_ids: [ branch.id ], from: from, to: to, where: where)

    # What each refund took off revenue and off each part of its sale. kept(x) is what the order keeps once x has been
    # refunded, never above its total: a refund only lowers revenue by the fall in what is kept.
    def refund_lines(refunds)
      rows = refunds.where(orders: { status: SOLD, is_staff_meal: false }).includes(:order).to_a
      return [] if rows.empty?
      ids = rows.map(&:order_id).uniq
      captured = Payment.where(order_id: ids, status: "captured").group(:order_id).sum(:amount_minor)
      history = Refund.where(order_id: ids).order(:refunded_at, :created_at, :id).pluck(:order_id, :id, :amount_minor).group_by(&:first)
      rows.map do |r|
        o = r.order
        before = history[o.id].take_while { |_, id, _| id != r.id }.sum(&:last)
        kept = ->(back) { (captured[o.id].to_i - back).clamp(0, [ o.total_minor, 0 ].max) }
        now, after = kept.call(before), kept.call(before + r.amount_minor)
        sale = Finance::Journal.sale_parts(o)
        parts = sale ? Finance::Journal.allocate(now, sale).merge(Finance::Journal.allocate(after, sale)) { |_, a, b| a - b } : PARTS.index_with(0).merge(sales: now - after)
        RefundLine.new(refund: r, order: o, business_day: r.business_day, revenue_minor: now - after, parts: parts)
      end
    end

    # The figures of one period: the sold orders on their days, less the refunds made on its days.
    class Period
      attr_reader :branch_ids, :from, :to

      def initialize(branch_ids:, from:, to:, where: {})
        @branch_ids, @from, @to, @where = Array(branch_ids), from, to, where
      end

      def orders = Revenue.sold(Order.where(branch_id: branch_ids, business_day: from..to).where(@where))

      def refunds
        @refunds ||= begin
          scope = Refund.where(branch_id: branch_ids, business_day: from..to).joins(:order)
          Revenue.refund_lines(@where.empty? ? scope : scope.where(orders: @where)) # an empty hash would read as 1=0
        end
      end

      def totals
        @totals ||= begin
          count, total, subtotal, discount, *parts = orders.pick(Arel.sql("COUNT(*)"), Arel.sql("COALESCE(SUM(total_minor), 0)"), Arel.sql("COALESCE(SUM(subtotal_minor), 0)"),
                                                                   Arel.sql("COALESCE(SUM(discount_minor), 0)"), *PART_SQL.values.map { |s| Arel.sql("COALESCE(#{s}, 0)") })
          sold = PARTS.zip(parts.map(&:to_i)).to_h
          back = PARTS.index_with { |k| refunds.sum { |l| l.parts[k] } }
          net = PARTS.index_with { |k| sold[k] - back[k] }
          { orders: count.to_i, gross_minor: total.to_i, refunds_minor: refunds.sum(&:revenue_minor), revenue_minor: total.to_i - refunds.sum(&:revenue_minor),
            subtotal_minor: subtotal.to_i, discount_minor: discount.to_i, sold_parts: sold, refund_parts: back, parts: net,
            tax_minor: net[:tax], tips_minor: net[:tip], income_minor: INCOME.sum { |k| net[k] } }
        end
      end

      def revenue_minor = totals[:revenue_minor]
      def tax_minor = totals[:tax_minor]
      def income_minor = totals[:income_minor]

      # Grouped figures, { key => { orders:, revenue_minor:, discount_minor:, tax_minor: } }. key is :business_day (a
      # refund on its own day), :hour (of the sale, in tz; a refund at its order's hour) or an orders column (a refund
      # under its order's value).
      def grouped(key, tz: nil)
        expr = key_sql(key, tz)
        out = Hash.new { |h, k| h[k] = { orders: 0, revenue_minor: 0, discount_minor: 0, tax_minor: 0 } }
        orders.group(Arel.sql(expr)).pluck(Arel.sql(expr), Arel.sql("COUNT(*)"), Arel.sql("SUM(total_minor)"), Arel.sql("SUM(discount_minor)"), Arel.sql(PART_SQL[:tax])).each do |k, c, t, d, x|
          out[normal(key, k)] = { orders: c.to_i, revenue_minor: t.to_i, discount_minor: d.to_i, tax_minor: x.to_i }
        end
        refunds.each do |l|
          row = out[refund_key(key, l, tz)]
          row[:revenue_minor] -= l.revenue_minor
          row[:tax_minor] -= l.parts[:tax]
        end
        {}.merge(out) # without the default, so a lookup of a missing key adds nothing
      end

      private

      def key_sql(key, tz)
        case key
        when :business_day then "orders.business_day"
        when :hour then "EXTRACT(HOUR FROM (COALESCE(orders.paid_at, orders.closed_at) AT TIME ZONE 'UTC') AT TIME ZONE #{ActiveRecord::Base.connection.quote(tz)})"
        else "orders.#{Order.connection.quote_column_name(key)}"
        end
      end

      def normal(key, value) = key == :hour ? value&.to_i : value

      def refund_key(key, line, tz)
        case key
        when :business_day then line.business_day
        when :hour then (line.order.paid_at || line.order.closed_at)&.in_time_zone(tz)&.hour
        else line.order.public_send(key)
        end
      end
    end
  end
end

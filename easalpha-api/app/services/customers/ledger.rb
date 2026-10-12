module Customers
  # Khata ledger: charges (orders paid on account), refunds, payments and adjustments (opening balances, corrections and
  # their reversals), with a running balance. A period (from..to) starts from the balance brought forward. Aging
  # allocates credits FIFO to charges.
  module Ledger
    module_function

    # Every entry for a customer, oldest first, each with the running balance. Sorted by date, then by time of entry.
    def entries(customer, from: nil, to: nil)
      rows = (charges(customer) + refunds(customer) + payments(customer) + adjustments(customer)).sort_by { |e| [ e[:date], e[:at] ] }
      balance = 0
      rows.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
      return rows if from.nil? && to.nil?
      rows.select { |e| (from.nil? || e[:date] >= from) && (to.nil? || e[:date] <= to) }
    end

    # A period view: what was owed before, every entry inside the period, totals and the closing balance.
    def statement(customer, from:, to:)
      all = entries(customer)
      before = all.select { |e| e[:date] < from }
      inside = all.select { |e| e[:date] >= from && e[:date] <= to }
      opening = before.last&.dig(:balance_minor) || 0
      closing = inside.last&.dig(:balance_minor) || opening
      { from: from, to: to, brought_forward_minor: opening, closing_balance_minor: closing, entries: inside, totals: totals(inside) }
    end

    def totals(rows)
      { charges_minor: rows.select { |e| e[:kind] == "charge" }.sum { |e| e[:amount_minor] },
        payments_minor: -rows.select { |e| e[:kind] == "payment" }.sum { |e| e[:amount_minor] },
        refunds_minor: -rows.select { |e| e[:kind] == "refund" }.sum { |e| e[:amount_minor] },
        paid_out_minor: rows.select { |e| e[:kind] == "paid_out" }.sum { |e| e[:amount_minor] },
        adjustments_minor: rows.select { |e| e[:kind].in?(%w[opening adjustment reversal]) }.sum { |e| e[:amount_minor] } }
    end

    def charges(customer)
      Payment.where(customer_id: customer.id, method_code: "khata", status: "captured").includes(order: :items).map do |p|
        items = p.order.items.reject { |i| i.respond_to?(:cancelled?) && i.cancelled? }.map { |i| "#{format_qty(i.quantity)}x #{i.name_snapshot}" }.join(", ")
        { at: p.received_at, date: p.business_day, kind: "charge", amount_minor: p.amount_minor, order_id: p.order_id, order_label: p.order.label, items: items, business_day: p.business_day, ref: p.id }
      end
    end

    def refunds(customer)
      Refund.joins(:payment_method).includes(:order).where(order_id: Order.where(customer_id: customer.id).select(:id), payment_methods: { kind: "khata" }).map do |r|
        { at: r.refunded_at, date: r.business_day, kind: "refund", amount_minor: -r.amount_minor, order_id: r.order_id, order_label: r.order&.label, reason: r.reason, business_day: r.business_day, ref: r.id }
      end
    end

    def payments(customer)
      CustomerPayment.where(customer_id: customer.id).includes(:payment_method).map do |cp|
        { at: cp.received_at, date: cp.business_day, kind: cp.direction == "received" ? "payment" : "paid_out", amount_minor: cp.direction == "received" ? -cp.amount_minor : cp.amount_minor,
          number: cp.number, method: cp.payment_method&.code, method_name: cp.payment_method&.name, reference: cp.reference, business_day: cp.business_day, ref: cp.id }
      end
    end

    def adjustments(customer)
      reversed = CustomerAdjustment.where(customer_id: customer.id).where.not(reverses_id: nil).pluck(:reverses_id).to_set
      CustomerAdjustment.where(customer_id: customer.id).includes(:reverses).map do |a|
        { at: a.created_at, date: a.effective_on, kind: a.kind, amount_minor: a.amount_minor, number: a.number, label: a.label, reason: a.reason, business_day: a.business_day,
          reverses_label: a.reverses&.label, reversed: reversed.include?(a.id), by_membership_id: a.by_membership_id, approved_by_membership_id: a.approved_by_membership_id, ref: a.id }
      end
    end

    def format_qty(q)
      d = BigDecimal(q.to_s)
      d.frac.zero? ? d.to_i.to_s : d.round(3).to_s("F")
    end

    BUCKETS = [ [ 0, 30 ], [ 31, 60 ], [ 61, 90 ], [ 91, nil ] ].freeze

    # Debits (charges, positive adjustments, money paid out to the customer) age from their date; credits (payments,
    # refunds, negative adjustments) settle the oldest debits first.
    def aging(customer, as_of: Date.current)
      rows = entries(customer)
      debits = rows.select { |e| e[:amount_minor].positive? }.map { |e| [ e[:date], e[:amount_minor] ] }
      remaining = -rows.select { |e| e[:amount_minor].negative? }.sum { |e| e[:amount_minor] }
      buckets = { "current" => 0, "31_60" => 0, "61_90" => 0, "over_90" => 0 }
      debits.each do |day, amount|
        if remaining >= amount
          remaining -= amount
          next
        end
        open_amount = amount - remaining
        remaining = 0
        age = (as_of - day).to_i
        key = age <= 30 ? "current" : age <= 60 ? "31_60" : age <= 90 ? "61_90" : "over_90"
        buckets[key] += open_amount
      end
      buckets.merge("total" => buckets.values.sum)
    end

    def aging_report(as_of: Date.current)
      rows = Customer.active.where("balance_minor > 0").order(balance_minor: :desc).map do |c|
        { customer: CustomerSerializers.customer(c), aging: aging(c, as_of: as_of) }
      end
      totals = %w[current 31_60 61_90 over_90 total].index_with { |k| rows.sum { |r| r[:aging][k] } }
      { as_of: as_of, rows: rows, totals: totals, customers_with_due: rows.size }
    end

    def summary
      { total_outstanding_minor: Customer.active.where("balance_minor > 0").sum(:balance_minor), customers_with_due: Customer.active.where("balance_minor > 0").count,
        credit_customers: Customer.active.where("balance_minor <> 0 or credit_limit_minor is not null").count, total_customers: Customer.active.count,
        collected_this_month_minor: CustomerPayment.where(direction: "received").where("received_at >= ?", Time.current.beginning_of_month).sum(:amount_minor) }
    end
  end
end

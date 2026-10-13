module Customers
  # Khata ledger: charges (orders paid on account), refunds, payments and adjustments (opening balances, corrections and
  # their reversals), with a running balance. A period (from..to) starts from the balance brought forward, summed in
  # SQL, and loads only its own rows. Aging allocates credits FIFO to charges.
  module Ledger
    module_function

    SLICE = 500 # customers per query when building many statements at once

    # Every entry for a customer, oldest first, each with the running balance. Sorted by date, then by time of entry.
    # items: false leaves out the order lines where nobody reads them.
    def entries(customer, from: nil, to: nil, items: true)
      rows = grouped_rows([ customer.id ], items: items)[customer.id] || []
      balance = 0
      rows.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
      return rows if from.nil? && to.nil?
      rows.select { |e| (from.nil? || e[:date] >= from) && (to.nil? || e[:date] <= to) }
    end

    # A period view: what was owed before, every entry inside the period, totals and the closing balance.
    def statement(customer, from:, to:, items: true) = statements([ customer ], from: from, to: to, items: items)[customer.id]

    # Statements for many customers, by customer id. Each slice of customers costs one query per kind of row, and only
    # the period's rows are loaded, so the cost follows the period, not each customer's whole history.
    def statements(customers, from:, to:, items: true)
      customers.map(&:id).uniq.each_slice(SLICE).each_with_object({}) do |ids, out|
        openings = balances(ids, before: from)
        rows = grouped_rows(ids, from: from, to: to, items: items)
        ids.each do |id|
          opening = openings[id].to_i
          inside = rows[id] || []
          balance = opening
          inside.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
          out[id] = { from: from, to: to, brought_forward_minor: opening, closing_balance_minor: balance, entries: inside, totals: totals(inside) }
        end
      end
    end

    # Balance per customer id from SQL sums, with the same signs as the entries: every row, or only rows dated before a
    # day. No customer ids means every customer (the nightly rebuild).
    def balances(customer_ids = nil, before: nil)
      upto = ->(scope, column) { before ? scope.where(column => ...before) : scope }
      charged = upto.(khata_payments(customer_ids), :business_day).group(:customer_id).sum(:amount_minor)
      refunded = upto.(khata_refunds(customer_ids), :business_day).group("orders.customer_id").sum(:amount_minor)
      paid = upto.(account_payments(customer_ids), :business_day).group(:customer_id).sum(Arel.sql("CASE WHEN direction = 'received' THEN -amount_minor ELSE amount_minor END"))
      adjusted = upto.(account_adjustments(customer_ids), :effective_on).group(:customer_id).sum(:amount_minor)
      (charged.keys | refunded.keys | paid.keys | adjusted.keys).index_with { |id| charged[id].to_i - refunded[id].to_i + paid[id].to_i + adjusted[id].to_i }
    end

    # Entries for some customers, by customer id, each list oldest first (no running balance yet); optionally only those
    # dated from..to.
    def grouped_rows(ids, from: nil, to: nil, items: true)
      pairs = charges(ids, from, to, items) + refunds(ids, from, to) + payments(ids, from, to) + adjustments(ids, from, to)
      pairs.group_by(&:first).transform_values { |list| list.map(&:last).sort_by { |e| [ e[:date], e[:at] ] } }
    end

    def totals(rows)
      { charges_minor: rows.select { |e| e[:kind] == "charge" }.sum { |e| e[:amount_minor] },
        payments_minor: -rows.select { |e| e[:kind] == "payment" }.sum { |e| e[:amount_minor] },
        refunds_minor: -rows.select { |e| e[:kind] == "refund" }.sum { |e| e[:amount_minor] },
        paid_out_minor: rows.select { |e| e[:kind] == "paid_out" }.sum { |e| e[:amount_minor] },
        adjustments_minor: rows.select { |e| e[:kind].in?(%w[opening adjustment reversal]) }.sum { |e| e[:amount_minor] } }
    end

    # Each kind of row comes back as [customer id, entry].
    def charges(ids, from, to, items)
      dated(khata_payments(ids), :business_day, from, to).preload(items ? { order: :items } : :order).map do |p|
        [ p.customer_id, { at: p.received_at, date: p.business_day, kind: "charge", amount_minor: p.amount_minor, order_id: p.order_id, order_label: p.order.label,
                           items: items ? item_list(p.order) : nil, business_day: p.business_day, ref: p.id } ]
      end
    end

    def refunds(ids, from, to)
      dated(khata_refunds(ids), :business_day, from, to).preload(:order).map do |r|
        [ r.order.customer_id, { at: r.refunded_at, date: r.business_day, kind: "refund", amount_minor: -r.amount_minor, order_id: r.order_id, order_label: r.order.label, reason: r.reason,
                                 business_day: r.business_day, ref: r.id } ]
      end
    end

    def payments(ids, from, to)
      dated(account_payments(ids), :business_day, from, to).preload(:payment_method).map do |cp|
        [ cp.customer_id, { at: cp.received_at, date: cp.business_day, kind: cp.direction == "received" ? "payment" : "paid_out", amount_minor: cp.direction == "received" ? -cp.amount_minor : cp.amount_minor,
                            number: cp.number, method: cp.payment_method&.code, method_name: cp.payment_method&.name, reference: cp.reference, business_day: cp.business_day, ref: cp.id } ]
      end
    end

    # A row reversed after the period still shows as reversed, so reversals are looked up across all dates.
    def adjustments(ids, from, to)
      reversed = account_adjustments(ids).where.not(reverses_id: nil).pluck(:reverses_id).to_set
      dated(account_adjustments(ids), :effective_on, from, to).preload(:reverses).map do |a|
        [ a.customer_id, { at: a.created_at, date: a.effective_on, kind: a.kind, amount_minor: a.amount_minor, number: a.number, label: a.label, reason: a.reason, business_day: a.business_day,
                           reverses_label: a.reverses&.label, reversed: reversed.include?(a.id), by_membership_id: a.by_membership_id, approved_by_membership_id: a.approved_by_membership_id, ref: a.id } ]
      end
    end

    # The rows behind each kind of entry, for some customers (nil: all). The entries and the SQL sums share them, so
    # both count the same rows. A refund belongs to the customer on its order.
    def khata_payments(ids) = only(Payment.where(method_code: "khata", status: "captured"), :customer_id, ids)
    def khata_refunds(ids) = only(Refund.joins(:payment_method, :order).where(payment_methods: { kind: "khata" }), "orders.customer_id", ids)
    def account_payments(ids) = only(CustomerPayment.all, :customer_id, ids)
    def account_adjustments(ids) = only(CustomerAdjustment.all, :customer_id, ids)
    def only(scope, column, ids) = ids ? scope.where(column => ids) : scope

    def dated(scope, column, from, to)
      scope = scope.where(column => from..) if from
      to ? scope.where(column => ..to) : scope
    end

    def item_list(order) = order.items.reject { |i| i.respond_to?(:cancelled?) && i.cancelled? }.map { |i| "#{format_qty(i.quantity)}x #{i.name_snapshot}" }.join(", ")

    def format_qty(q)
      d = BigDecimal(q.to_s)
      d.frac.zero? ? d.to_i.to_s : d.round(3).to_s("F")
    end

    BUCKETS = [ [ 0, 30 ], [ 31, 60 ], [ 61, 90 ], [ 91, nil ] ].freeze

    def aging(customer, as_of: Date.current) = age_rows(grouped_rows([ customer.id ], items: false)[customer.id] || [], as_of)

    # Debits (charges, positive adjustments, money paid out to the customer) age from their date; credits (payments,
    # refunds, negative adjustments) settle the oldest debits first.
    def age_rows(rows, as_of)
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
      customers = Customer.active.where("balance_minor > 0").order(balance_minor: :desc).to_a
      rows = customers.each_slice(SLICE).flat_map do |slice|
        by_customer = grouped_rows(slice.map(&:id), items: false)
        slice.map { |c| { customer: CustomerSerializers.customer(c), aging: age_rows(by_customer[c.id] || [], as_of) } }
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

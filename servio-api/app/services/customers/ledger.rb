module Customers
  # Khata ledger: charges (orders paid on account) and payments, with a running balance. Aging allocates payments FIFO to charges.
  module Ledger
    module_function

    def entries(customer)
      charges = Payment.where(customer_id: customer.id, method_code: "khata", status: "captured").includes(:order).map do |p|
        { at: p.received_at, kind: "charge", amount_minor: p.amount_minor, order_id: p.order_id, order_label: p.order.label, business_day: p.business_day, ref: p.id }
      end
      refunds = Refund.joins(:payment_method).where(order_id: Order.where(customer_id: customer.id).select(:id), payment_methods: { kind: "khata" }).map do |r|
        { at: r.refunded_at, kind: "refund", amount_minor: -r.amount_minor, order_id: r.order_id, business_day: r.business_day, ref: r.id }
      end
      payments = CustomerPayment.where(customer_id: customer.id).map do |cp|
        { at: cp.received_at, kind: cp.direction == "received" ? "payment" : "paid_out", amount_minor: cp.direction == "received" ? -cp.amount_minor : cp.amount_minor,
          number: cp.number, method: cp.payment_method&.code, reference: cp.reference, business_day: cp.business_day, ref: cp.id }
      end
      rows = (charges + refunds + payments).sort_by { |e| e[:at] }
      balance = 0
      rows.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
      rows
    end

    BUCKETS = [[0, 30], [31, 60], [61, 90], [91, nil]].freeze

    def aging(customer, as_of: Date.current)
      charges = Payment.where(customer_id: customer.id, method_code: "khata", status: "captured").order(:received_at).map { |p| [p.received_at.to_date, p.amount_minor] }
      credits = CustomerPayment.where(customer_id: customer.id, direction: "received").sum(:amount_minor) +
                Refund.joins(:payment_method).where(order_id: Order.where(customer_id: customer.id).select(:id), payment_methods: { kind: "khata" }).sum(:amount_minor) -
                CustomerPayment.where(customer_id: customer.id, direction: "paid").sum(:amount_minor)
      remaining = credits
      buckets = { "current" => 0, "31_60" => 0, "61_90" => 0, "over_90" => 0 }
      charges.each do |day, amount|
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

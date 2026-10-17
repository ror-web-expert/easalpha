module Billing
  # Creates subscription invoices. Pakistan pays by JazzCash, EasyPaisa or bank with a reference; international through Paddle.
  module Issuer
    module_function

    def price_for(plan, cycle:, currency:, tills: 1)
      base = currency == "PKR" ? plan.price_pkr_minor : plan.price_usd_minor
      extra_till = currency == "PKR" ? 1_000_00 : 9_00
      monthly = base + extra_tills(plan, tills) * extra_till
      cycle == "yearly" ? monthly * 10 : monthly
    end

    # Tills beyond what the plan includes. A plan with no till limit (Business since 17 Oct 2026) includes every till,
    # so it never bills extra ones; a missing limit used to read as one till.
    def extra_tills(plan, tills)
      limit = plan.limits.key?("tills") ? plan.limits["tills"] : 1
      return 0 if limit.nil?
      [ tills.to_i - limit.to_i, 0 ].max
    end

    def issue!(business, plan:, cycle:, tills: 1, subscription: nil, due_on: Date.current + 7)
      currency = business.country == "PK" ? "PKR" : "USD"
      amount = price_for(plan, cycle: cycle, currency: currency, tills: tills)
      label = cycle == "yearly" ? "#{plan.name} yearly" : "#{plan.name} #{Date.current.strftime('%B %Y')}"
      inv = Invoice.create!(business: business, subscription: subscription, amount_minor: amount, currency: currency, due_on: due_on, status: "open", period_label: label,
                            lines: [ { description: label, amount_minor: amount }, ({ description: "Extra tills x#{extra_tills(plan, tills)}", amount_minor: 0 } if extra_tills(plan, tills).positive?) ].compact)
      Lifecycle.notify_owners(business, "invoice_due", { business_name: business.name, number: inv.number, amount: amount / 100, due_on: due_on.to_s }, title: "Invoice #{inv.number} due #{due_on}", link: "/settings/billing")
      inv
    end

    def issue_period!(business, sub)
      issue!(business, plan: sub.plan, cycle: sub.billing_cycle, tills: sub.tills, subscription: sub)
    end

    def confirm!(invoice, by_super_admin: nil, provider_ref: nil)
      business = invoice.business
      invoice.update!(status: "paid", confirmed_at: Time.current, confirmed_by_super_admin_id: by_super_admin&.id, payment_reference: provider_ref || invoice.payment_reference)
      PaymentsReceived.record!(invoice)
      plan = invoice.subscription&.plan || business.plan || Plan.find_by!(code: "pro")
      cycle = invoice.subscription&.billing_cycle || (invoice.period_label.to_s.include?("yearly") ? "yearly" : "monthly")
      Lifecycle.activate!(business, plan: plan, cycle: cycle, tills: invoice.subscription&.tills || 1)
      invoice
    end
  end

  module PaymentsReceived
    module_function
    def record!(invoice)
      ActiveRecord::Base.connection.execute(ActiveRecord::Base.sanitize_sql_array([
        "INSERT INTO payments_received (id, business_id, invoice_id, amount_minor, method, reference, received_on, created_at, updated_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, now(), now())",
        invoice.business_id, invoice.id, invoice.amount_minor, invoice.payment_method || "manual", invoice.payment_reference, Date.current
      ]))
    end
  end
end

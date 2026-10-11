module Receipts
  # The receipt as data. The till renders it for 58 or 80 mm paper; the digital receipt uses the same structure.
  module Builder
    module_function

    def build(order, duplicate: false)
      business = order.business
      branch = order.branch
      receipt = business.setting("receipt") || {}
      {
        receipt_number: order.receipt_number, duplicate: duplicate, printed_at: Time.current,
        business: { name: business.name, legal_name: business.legal_name, phone: business.phone, logo_key: business.logo_key, currency: business.currency },
        branch: { name: branch.name, address: branch.address, city: branch.city, phone: branch.phone, tax_registration: branch.tax_registration },
        header: receipt["header"], footer: receipt["footer"], language: receipt["language"] || "en", paper: receipt["paper"] || "80",
        order: { id: order.id, serial: order.serial, label: order.label, order_type: order.order_type, table: order.dining_table&.code, business_day: order.business_day,
                 placed_at: order.placed_at, paid_at: order.paid_at, cashier: Membership.unscoped.find_by(id: order.completed_by_membership_id || order.taken_by_membership_id)&.user&.name,
                 customer: order.customer && { name: order.customer.name, phone: order.customer.phone, khata_no: order.customer.khata_no }, guest_name: order.guest_name, notes: order.notes },
        lines: order.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F"), unit_price_minor: i.unit_price_minor, modifiers: i.modifiers.map { |m| { name: m.name_snapshot, price_minor: m.price_minor_snapshot } }, line_total_minor: i.line_total_minor, discount_minor: i.line_discount_minor, notes: i.notes } },
        totals: { subtotal_minor: order.subtotal_minor, discount_minor: order.discount_minor, service_charge_minor: order.service_charge_minor, tax_minor: order.tax_minor,
                  tax_lines: tax_lines(order), delivery_charge_minor: order.delivery_charge_minor, rounding_minor: order.rounding_minor, tip_minor: order.tip_minor, total_minor: order.total_minor, paid_minor: order.paid_minor, due_minor: order.due_minor },
        payments: order.payments.where(status: "captured").includes(received_by: :user).map { |p| { id: p.id, method: p.method_code, amount_minor: p.amount_minor, tendered_minor: p.tendered_minor, change_minor: p.change_minor, reference: p.reference, received_at: p.received_at, received_by: p.received_by&.user&.name } },
        refunds: order.refunds.map { |r| { method: r.payment_method.code, amount_minor: r.amount_minor, reason: r.reason } },
        khata: order.customer && Payment.where(order_id: order.id, method_code: "khata").exists? ? { balance_minor: order.customer.balance_minor } : nil,
        tax_invoice: (inv = TaxInvoice.find_by(order_id: order.id)) ? { number: inv.invoice_number, qr: inv.qr_payload, status: inv.status, authority: inv.authority } : { number: nil, qr: nil, status: Tax::Invoicer.registered?(branch) ? "pending" : "not_registered" },
        feedback_whatsapp: business.phone
      }
    end

    def tax_lines(order)
      order.active_items.group_by { |i| [ i.tax_rate_snapshot.to_f, i.tax_inclusive_snapshot ] }.map do |(rate, inclusive), items|
        { rate: rate, inclusive: inclusive, taxable_minor: items.sum { |i| i.line_subtotal_minor - i.line_discount_minor }, tax_minor: items.sum(&:line_tax_minor) }
      end.reject { |t| t[:rate].zero? }
    end
  end
end

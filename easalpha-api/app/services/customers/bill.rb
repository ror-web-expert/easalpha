module Customers
  # A customer's bill for a period: what was owed before, every purchase on account with its items, payments,
  # adjustments, the amount due and the due date. Shared by the admin screen, the PDF, WhatsApp and the public link.
  module Bill
    module_function

    def build(customer, from:, to:, due_on: nil, issued_on: nil)
      st = Customers::Ledger.statement(customer, from: from, to: to)
      business = customer.business
      branch = Branch.active.order(is_main: :desc).first
      period_label = from.beginning_of_month == from && to == from.end_of_month ? from.strftime("%B %Y") : "#{from.strftime('%-d %b %Y')} to #{to.strftime('%-d %b %Y')}"
      st.merge(
        number: "BILL-#{customer.khata_no}-#{to.strftime('%Y%m')}",
        period_label: period_label,
        bill_date: issued_on || [ to, Date.current ].max,
        due_on: due_on,
        filename: "bill-#{customer.khata_no}-#{to.strftime('%Y-%m')}.pdf",
        customer: { id: customer.id, name: customer.name, khata_no: customer.khata_no, member_no: customer.member_no, room: customer.room, phone: customer.phone,
                    guardian_name: customer.guardian_name, guardian_phone: customer.guardian_phone, company: customer.company, credit_limit_minor: customer.credit_limit_minor },
        business: { name: business.name, phone: business.phone, currency: business.currency, address: branch&.respond_to?(:address) ? branch&.address : nil,
                    footer: business.setting("pos.receipt.footer").presence }
      )
    end

    # Default period: last calendar month, as of a business day.
    def last_month(today) = [ today.prev_month.beginning_of_month, today.prev_month.end_of_month ]

    def due_on_for(business, bill_date)
      days = business.setting("khata.monthly_bills.due_days").to_i
      days.positive? ? bill_date + days : nil
    end
  end
end

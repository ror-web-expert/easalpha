module Customers
  # WhatsApp messages about a customer account, sent to the customer's phone and, when asked for, the guardian's.
  # Automatic messages never raise: when WhatsApp is switched off or nobody has a phone, nothing is sent.
  module Notify
    module_function

    TEMPLATES = [
      [ "account_adjustment", "{business_name}: {customer_name} (Khata {khata_no}), your account was {direction} by Rs {amount}. Reason: {reason}. Previous balance Rs {previous_balance}, new balance Rs {new_balance}." ],
      [ "account_opening", "{business_name}: {customer_name} (Khata {khata_no}), your opening balance of Rs {amount} has been entered. Balance Rs {new_balance}." ],
      [ "account_bill", "{business_name}: {customer_name} (Khata {khata_no}), your bill for {period} is ready. Previous balance Rs {previous_balance}, purchases Rs {period_charges}, paid Rs {period_payments}. Amount due Rs {due_amount} by {due_on}. View or download: {link}" ]
    ].freeze

    def sale!(order)
      business = order.business
      return [] unless BusinessModules.on?(business, "customer_accounts") && truthy?(business.setting("khata.notify_each_sale"))
      customer = order.customer or return []
      amount = Payment.where(order_id: order.id, method_code: "khata", status: "captured").sum(:amount_minor)
      return [] unless amount.positive?
      vars = Whatsapp::Account.variables_for(customer, order: order).merge(order_total: rupees(amount))
      deliver(customer, "account_receipt", vars)
    end

    def adjustment!(adj, previous_balance_minor:)
      customer = adj.customer
      business = customer.business
      return [] unless truthy?(business.setting("khata.notify_adjustments"))
      name = adj.kind == "opening" ? "account_opening" : "account_adjustment"
      vars = Whatsapp::Account.variables_for(customer, previous_balance_minor: previous_balance_minor)
                                .merge(amount: rupees(adj.amount_minor.abs), reason: adj.reason, direction: adj.amount_minor.positive? ? "increased" : "reduced")
      deliver(customer, name, vars)
    end

    # The bill for a period, with the PDF attached when the linked phone sends it.
    def bill!(customer, bill:, link:, attach_pdf: true)
      vars = Whatsapp::Account.variables_for(customer).merge(
        period: bill[:period_label], previous_balance: rupees(bill[:brought_forward_minor]), period_charges: rupees(bill[:totals][:charges_minor]),
        period_payments: rupees(bill[:totals][:payments_minor]), due_amount: rupees([ bill[:closing_balance_minor], 0 ].max), due_on: bill[:due_on]&.strftime("%-d %b %Y") || "-", link: link
      )
      document = attach_pdf ? { "kind" => "customer_bill", "customer_id" => customer.id, "from" => bill[:from].to_s, "to" => bill[:to].to_s, "due_on" => bill[:due_on]&.to_s, "filename" => bill[:filename] } : nil
      deliver(customer, "account_bill", vars, document: document, strict: true)
    end

    # strict: raise when nothing can be sent, so a bill run can record why.
    def deliver(customer, template_name, vars, document: nil, strict: false)
      business = customer.business
      unless Whatsapp::Account.master_enabled?(business)
        raise Api::Errors::Conflict.new("whatsapp.disabled", "WhatsApp sending is switched off in Settings") if strict
        return []
      end
      phones = customer.account_phones
      if phones.empty?
        raise Api::Errors::BadRequest.new("whatsapp.no_phone", "#{customer.name} has no phone number") if strict
        return []
      end
      tpl = template(template_name)
      text = Whatsapp::Account.render(tpl.body, vars)
      phones.map do |phone|
        variables = vars.merge(text: text)
        variables[:document] = document if document
        Whatsapp::Sender.deliver(phone: phone, template: tpl.name, variables: variables, kind: tpl.category, business: business, customer_id: customer.id)
      end
    end

    def template(name)
      found = WhatsappTemplate.where(business_id: Current.business_id, name: name).first || WhatsappTemplate.where(business_id: nil, name: name, language: "en").first
      return found if found
      seed_templates!
      Whatsapp::Account.template(name)
    end

    def seed_templates!
      TEMPLATES.each do |name, body|
        WhatsappTemplate.find_or_initialize_by(business_id: nil, name: name, language: "en")
                        .update!(category: "utility", body: body, variables: Whatsapp::Account::VARIABLES + %w[amount reason direction period period_charges period_payments due_on], approval_status: "approved")
      end
      Whatsapp::Account.seed_account_templates!
    end

    def rupees(minor) = ActiveSupport::NumberHelper.number_to_delimited((minor.to_i / 100.0).round(2).then { |r| r == r.to_i ? r.to_i : r })
    def truthy?(v) = ActiveModel::Type::Boolean.new.cast(v) == true
  end
end

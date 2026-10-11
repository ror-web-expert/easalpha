module Whatsapp
  # SPEC Account notifications over WhatsApp: a master toggle that disables every send button, auto-send on account
  # payment, optional receipt image and store logo, Templates built from the SPEC variables, Manual Send, Bulk Send.
  module Account
    module_function

    VARIABLES = %w[customer_name order_number order_total order_items discount service_charge loyalty_points previous_balance new_balance business_name khata_no due_amount link].freeze

    def master_enabled?(business = Current.business) = ActiveModel::Type::Boolean.new.cast(business.setting("whatsapp.account.master_enabled"))
    def auto_send_on_payment?(business = Current.business) = master_enabled?(business) && ActiveModel::Type::Boolean.new.cast(business.setting("whatsapp.account.auto_send_on_payment"))

    def guard!(business = Current.business)
      raise Api::Errors::Conflict.new("whatsapp.disabled", "WhatsApp sending is switched off in Settings") unless master_enabled?(business)
    end

    # Variables for a customer (and optionally an order), per the SPEC list.
    def variables_for(customer, order: nil, previous_balance_minor: nil)
      biz = customer.business
      v = { customer_name: customer.name, khata_no: customer.khata_no, business_name: biz.name, new_balance: customer.balance_minor / 100, previous_balance: (previous_balance_minor || customer.balance_minor) / 100,
            loyalty_points: customer.loyalty_points, due_amount: [ customer.balance_minor, 0 ].max / 100 }
      if order
        v.merge!(order_number: order.label, order_total: order.total_minor / 100, discount: order.discount_minor / 100, service_charge: order.service_charge_minor / 100,
                 order_items: order.items.reject(&:cancelled?).map { |i| "#{i.quantity.to_i}x #{i.name_snapshot}" }.join(", "))
      end
      v
    end

    def render(body, variables)
      variables.reduce(body.to_s) { |s, (k, val)| s.gsub("{#{k}}", val.to_s).gsub("{{#{k}}}", val.to_s) }
    end

    # Manual Send: one customer, one template (business or shared), with the variables filled.
    def send!(customer:, template_name:, order: nil, extra: {}, actor: nil)
      guard!(customer.business)
      raise Api::Errors::BadRequest.new("whatsapp.no_phone", "#{customer.name} has no phone number") if customer.phone.blank?
      tpl = template(template_name)
      vars = variables_for(customer, order: order).merge(extra.symbolize_keys)
      msg = Whatsapp::Sender.deliver(phone: customer.phone, template: tpl.name, variables: vars.merge(text: render(tpl.body, vars)), kind: tpl.category, customer_id: customer.id)
      AuditLog.record(action: "create", record: msg, after: { template: tpl.name, customer: customer.name, by: actor&.id })
      msg
    end

    # Bulk Send: a list of customers or every customer with a balance; skips those without a phone.
    def bulk!(customer_ids: nil, segment: nil, template_name:, actor: nil)
      guard!
      scope = Customer.active.where(is_walk_in: false)
      scope = scope.where(id: customer_ids) if customer_ids.present?
      scope = scope.where("balance_minor > 0") if segment == "with_balance"
      scope = scope.where(whatsapp_opt_in: true) if segment == "opted_in"
      sent = skipped = 0
      scope.find_each do |c|
        if c.phone.blank?
          skipped += 1
          next
        end
        send!(customer: c, template_name: template_name, actor: actor)
        sent += 1
      end
      { sent: sent, skipped: skipped }
    end

    # Customer Account: send the statement (SEND_ACCOUNT_BILL).
    def send_statement!(customer, actor: nil)
      send!(customer: customer, template_name: "account_statement", actor: actor, extra: { link: "" })
    end

    def template(name)
      found = WhatsappTemplate.where(business_id: Current.business_id, name: name).first || WhatsappTemplate.where(business_id: nil, name: name, language: "en").first
      return found if found
      seed_account_templates! if ACCOUNT_TEMPLATES.any? { |n, _| n == name.to_s }
      WhatsappTemplate.where(business_id: nil, name: name, language: "en").first || raise(Api::Errors::NotFound.new("whatsapp.template", "No template named #{name}"))
    end

    ACCOUNT_TEMPLATES = [
      [ "account_statement", "{business_name}: {customer_name} (Khata {khata_no}), your account balance is Rs {new_balance}. Thank you." ],
      [ "account_payment_received", "{business_name} received Rs {order_total} from {customer_name}. Previous balance Rs {previous_balance}, new balance Rs {new_balance}." ],
      [ "account_receipt", "{business_name}: order {order_number} for Rs {order_total} was put on your account. Items: {order_items}. New balance Rs {new_balance}." ],
      [ "voucher", "{customer_name}, here is your voucher {code} worth {value} at {business_name}. Minimum spend Rs {min_spend}, valid until {expires_on}." ]
    ].freeze

    def seed_account_templates!
      ACCOUNT_TEMPLATES.each do |name, body|
        WhatsappTemplate.find_or_initialize_by(business_id: nil, name: name, language: "en").update!(category: "utility", body: body, variables: VARIABLES, approval_status: "approved")
      end
    end
  end
end

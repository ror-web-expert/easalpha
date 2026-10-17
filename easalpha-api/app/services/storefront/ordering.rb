module Storefront
  # Online ordering from the public storefront (Website Config): a cart becomes an order with source "online" that
  # waits for the cashier like a QR order, with the customer found or created by phone and the delivery address saved.
  module Ordering
    module_function

    ORDER_TYPES = %w[delivery takeaway].freeze

    def place!(business, cfg, lines:, order_type:, customer:, notes: nil, client_id: nil)
      sections = cfg.sections
      availability = sections["availability"] || {}
      delivery = sections["delivery"] || {}
      raise Api::Errors::Conflict.new("online.closed", (availability["closed_message"].presence || "Online ordering is closed right now")) if availability["online_ordering"] == false
      raise Api::Errors::Conflict.new("online.maintenance", "Ordering is paused for maintenance") if sections.dig("system", "maintenance") == true
      raise Api::Errors::Unprocessable.new("online.order_type", "Choose delivery or pickup") unless ORDER_TYPES.include?(order_type.to_s)
      raise Api::Errors::Conflict.new("online.no_delivery", "Delivery is not available; choose pickup") if order_type.to_s == "delivery" && delivery["enabled"] == false
      raise Api::Errors::Unprocessable.new("online.empty", "Add at least one item") if Array(lines).empty?
      c = customer.to_h.symbolize_keys
      raise Api::Errors::Unprocessable.new("online.name", "Please tell us your name") if c[:name].to_s.strip.blank?
      phone = User.normalize_phone(c[:phone].to_s)
      raise Api::Errors::Unprocessable.new("online.phone", "Please give a valid mobile number") unless phone.to_s.match?(/\A\+\d{8,}\z/)
      raise Api::Errors::Unprocessable.new("online.address", "Please give a delivery address") if order_type.to_s == "delivery" && c[:address].to_s.strip.blank?
      branch = Branch.active.order(is_main: :desc).first or raise Api::Errors::Conflict.new("online.no_branch", "No branch takes online orders")

      order = nil
      Order.transaction do
        cust = Customer.active.find_by(phone: phone) || Customer.create!(name: c[:name].to_s.strip, phone: phone, source: "online")
        address = nil
        if order_type.to_s == "delivery"
          line1 = c[:address].to_s.strip
          address = cust.addresses.find_by(line1: line1) || cust.addresses.create!(line1: line1, area: c[:area].presence, city: c[:city].presence, is_default: cust.addresses.none?)
        end
        attrs = { id: client_id.presence, order_type: order_type.to_s, source: "online", customer_id: cust.id, address_id: address&.id, guest_name: cust.name, notes: notes.presence,
                  qr_status: "pending", qr_guest_token: SecureRandom.hex(8) }
        order = Orders::Builder.create!(attrs.compact, lines: lines, actor: nil, device: nil, branch: branch).order
        min = delivery["min_order_minor"].to_i
        if order_type.to_s == "delivery" && min.positive? && order.subtotal_minor < min
          raise Api::Errors::Unprocessable.new("online.min_order", "Minimum order for delivery is #{business.currency} #{format('%.0f', min / 100.0)}")
        end
        free_above = delivery["free_above_minor"]
        if order_type.to_s == "delivery" && free_above.present? && order.subtotal_minor >= free_above.to_i && order.delivery_charge_minor.positive?
          Orders::Builder.new(order, actor: nil, branch: branch).update!(attrs: { delivery_charge_minor: 0, delivery_charge_percent: 0 })
        end
      end
      Notification.create!(kind: "online_order", title: "Online #{order.order_type} order from #{order.guest_name}", body: "Waiting for a cashier to accept", link: "/orders/#{order.id}")
      Realtime.order_changed(order)
      order.reload
    end

    # What the guest sees while tracking: the stage, the lines and the money.
    def guest_view(order, cfg)
      eta = (cfg.sections["delivery"] || {})["eta_minutes"]
      { id: order.id, label: order.label, guest_token: order.qr_guest_token, order_type: order.order_type, status: order.status, qr_status: order.qr_status,
        spec_status: order.spec_status, stage: stage(order), eta_minutes: order.order_type == "delivery" ? eta : nil, created_at: order.created_at, placed_at: order.placed_at, ready_at: order.ready_at,
        customer: { name: order.guest_name, address: order.address&.to_s },
        items: order.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F").sub(/\.0+\z/, ""), line_subtotal_minor: i.line_subtotal_minor, line_total_minor: i.line_subtotal_minor - i.line_discount_minor } },
        subtotal_minor: order.subtotal_minor, discount_minor: order.discount_minor, service_charge_minor: order.service_charge_minor, delivery_charge_minor: order.delivery_charge_minor,
        tax_minor: order.tax_minor, tax_inclusive_minor: Receipts::Builder.inclusive_tax_minor(order), rounding_minor: order.rounding_minor, total_minor: order.total_minor, currency: order.business.currency }
    end

    # One word the storefront shows: waiting, accepted, preparing, ready, on_the_way, done, rejected, cancelled.
    def stage(order)
      return "rejected" if order.qr_status == "rejected"
      return "cancelled" if order.status.in?(%w[voided cancelled])
      return "waiting" if order.qr_status == "pending"
      case order.status
      when "placed", "held", "draft" then "accepted"
      when "preparing" then "preparing"
      when "ready" then "ready"
      when "dispatched" then "on_the_way"
      else "done"
      end
    end
  end
end

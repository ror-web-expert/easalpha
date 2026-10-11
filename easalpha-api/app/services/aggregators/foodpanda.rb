module Aggregators
  # Foodpanda orders arrive by webhook, become delivery orders with source foodpanda, and carry the commission so reports show the real margin.
  module Foodpanda
    module_function

    def settings(business) = { "enabled" => false, "secret" => nil, "commission_percent" => 30, "auto_accept" => true, "branch_id" => nil }.merge(business.settings["foodpanda"] || {})

    def signature_valid?(business, body, signature)
      secret = settings(business)["secret"].to_s
      return false if secret.blank? || signature.blank?
      expected = OpenSSL::HMAC.hexdigest("SHA256", secret, body)
      ActiveSupport::SecurityUtils.secure_compare(expected, signature.to_s.sub(/\Asha256=/, ""))
    end

    # payload: { event: "order.new|order.cancelled", order: { id, customer: {name, phone}, address: {text}, items: [{sku|name, quantity, price}], total, delivery_fee, notes } }
    def ingest!(business, payload)
      cfg = settings(business)
      raise Api::Errors::Conflict.new("foodpanda.disabled", "Foodpanda integration is off") unless cfg["enabled"]
      event = payload["event"].to_s
      data = payload["order"] || {}
      external_id = data["id"].to_s
      raise Api::Errors::BadRequest.new("foodpanda.payload", "order.id is required") if external_id.blank?
      existing = AggregatorEvent.find_by(provider: "foodpanda", external_id: external_id, event: event)
      return existing if existing
      branch = (cfg["branch_id"] && Branch.active.find_by(id: cfg["branch_id"])) || Branch.active.order(is_main: :desc).first
      ev = AggregatorEvent.create!(provider: "foodpanda", branch: branch, external_id: external_id, event: event, payload: payload, received_at: Time.current)
      begin
        case event
        when "order.new" then ev.update!(order_id: create_order!(branch, data, cfg).id, status: "processed")
        when "order.cancelled" then ev.update!(order_id: cancel_order!(external_id)&.id, status: "processed")
        else ev.update!(status: "ignored")
        end
      rescue StandardError => e
        ev.update!(status: "failed", error: "#{e.class}: #{e.message}")
        raise
      end
      ev
    end

    def create_order!(branch, data, cfg)
      lines = Array(data["items"]).map do |i|
        product = (i["sku"].present? && Product.active.find_by(sku: i["sku"])) || Product.active.find_by(name: i["name"].to_s)
        if product
          { product_id: product.id, quantity: i["quantity"].presence || 1, notes: i["notes"] }
        else
          { open_item: { name: i["name"].to_s.presence || "Foodpanda item", price_minor: (i["price"].to_d * 100).round }, quantity: i["quantity"].presence || 1 }
        end
      end
      customer = nil
      if data.dig("customer", "phone").present?
        phone = User.normalize_phone(data["customer"]["phone"])
        customer = Customer.active.find_by(phone: phone) || Customer.create!(name: data.dig("customer", "name").presence || "Foodpanda customer", phone: phone, source: "online")
      end
      attrs = { order_type: "delivery", source: "foodpanda", customer_id: customer&.id, guest_name: data.dig("customer", "name"), notes: [ data["notes"], data.dig("address", "text") ].compact.join(" | ").presence,
                aggregator_ref: data["id"].to_s, delivery_charge_minor: (data["delivery_fee"].to_d * 100).round }
      builder = Orders::Builder.create!(attrs.compact, lines: lines, actor: nil, device: nil, branch: branch, approvals: { "items.open" => :system, "orders.create" => :system })
      order = builder.order
      order.update_columns(aggregator_commission_minor: (order.total_minor * cfg["commission_percent"].to_d / 100).round)
      Orders::Transitions.place!(order, actor: nil) if cfg["auto_accept"]
      Notification.create!(kind: "aggregator_order", title: "Foodpanda order #{order.label} Rs #{order.total_minor / 100}", body: data.dig("address", "text").to_s, link: "/orders/#{order.id}")
      order
    end

    def cancel_order!(external_id)
      order = Order.find_by(source: "foodpanda", aggregator_ref: external_id) or return nil
      return order unless order.open?
      Orders::Transitions.void!(order, reason: "Cancelled by Foodpanda", actor: nil, approver: nil)
      order
    end

    def report(branch:, from:, to:)
      orders = Order.where(branch_id: branch.id, source: "foodpanda", business_day: from..to)
      paid = orders.where(status: %w[paid closed refunded])
      { from: from, to: to, orders: orders.count, paid_orders: paid.count, voided: orders.where(status: "voided").count, sales_minor: paid.sum(:total_minor), commission_minor: paid.sum(:aggregator_commission_minor),
        net_minor: paid.sum(:total_minor) - paid.sum(:aggregator_commission_minor), by_day: paid.group(:business_day).sum(:total_minor) }
    end
  end
end

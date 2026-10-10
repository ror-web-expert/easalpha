module Qr
  # QR table ordering: the guest scans a table card, sees the live menu, places an order that waits for the cashier (when set), calls a waiter or asks for the bill.
  module Ordering
    module_function

    def find_table!(token)
      table = Tenancy::Context.unscoped { DiningTable.find_by(qr_token: token, archived_at: nil) } or raise Api::Errors::NotFound.new("qr.unknown", "This table card is not valid")
      table
    end

    def menu(table)
      branch = table.branch
      business = branch.business
      cfg = branch.qr_config
      base = { business: { name: business.name, currency: business.currency, logo_key: business.respond_to?(:logo_key) ? business.logo_key : nil }, branch: { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone },
               table: { id: table.id, code: table.code, name: table.name, seats: table.seats }, settings: cfg.slice("enabled", "cashier_accept", "call_waiter", "ask_bill", "running_bill", "guest_name", "welcome") }
      return base.merge(ordering: false, message: "Ordering is not available right now. Please ask a waiter.") unless cfg["enabled"]
      menus = Menu.active.order(:sort_order).select { |m| m.available_at?(Time.current, zone: business.time_zone) }
      categories = Category.active.where(menu_id: menus.map(&:id)).order(:sort_order)
      products = Product.live.where(category_id: categories.map(&:id)).includes(:variants, :product_prices, :product_modifier_groups, :tax_rate).order(:sort_order)
      base.merge(ordering: true,
                 categories: categories.map { |c| MenuSerializers.category(c) },
                 products: products.map { |p| MenuSerializers.product(p, full: true).merge(price_minor: p.price_for(order_type: "dine_in", branch_id: branch.id)) },
                 modifier_groups: ModifierGroup.active.includes(:modifiers).map { |g| MenuSerializers.modifier_group(g) },
                 deals: Deal.active.includes(:deal_items).select { |d| d.available_at?(Time.current) }.map { |d| MenuSerializers.deal(d) },
                 running_bill: cfg["running_bill"] ? bill(table) : nil)
    end

    def bill(table)
      order = table.current_order_id && Order.open.find_by(id: table.current_order_id)
      return nil unless order
      { order_id: order.id, label: order.label, status: order.status, guest_name: order.guest_name, items: order.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F"), line_total_minor: i.line_total_minor } },
        subtotal_minor: order.subtotal_minor, discount_minor: order.discount_minor, service_charge_minor: order.service_charge_minor, tax_minor: order.tax_minor, total_minor: order.total_minor, paid_minor: order.paid_minor }
    end

    # Places a guest order. With cashier_accept it stays a draft marked pending until a cashier accepts; otherwise it goes straight to the kitchen.
    def place!(table, lines:, guest_name: nil, notes: nil, client_id: nil)
      branch = table.branch
      cfg = branch.qr_config
      raise Api::Errors::Conflict.new("qr.disabled", "Ordering is not available right now") unless cfg["enabled"]
      raise Api::Errors::Unprocessable.new("qr.guest_name", "Please tell us your name") if cfg["guest_name"] && guest_name.blank?
      raise Api::Errors::Unprocessable.new("qr.empty", "Add at least one item") if Array(lines).empty?
      existing = table.current_order_id && Order.open.find_by(id: table.current_order_id)
      order = nil
      Order.transaction do
        if existing && existing.qr_status != "pending" && existing.source == "qr"
          builder = Orders::Builder.new(existing, actor: nil, branch: branch)
          current = existing.active_items.map { |i| { id: i.id, product_id: i.product_id, variant_id: i.variant_id, deal_id: i.deal_id, quantity: i.quantity } }
          builder.update!(lines: current + Array(lines), attrs: { guest_name: existing.guest_name.presence || guest_name })
          Orders::Transitions.after_edit!(existing, added: builder.added, removed: builder.removed) unless cfg["cashier_accept"]
          order = existing
          if cfg["cashier_accept"]
            order.update!(qr_status: "pending")
          end
        else
          attrs = { id: client_id.presence, order_type: "dine_in", source: "qr", table_id: table.id, guest_name: guest_name, notes: notes, qr_status: cfg["cashier_accept"] ? "pending" : "accepted", qr_guest_token: SecureRandom.hex(8) }
          builder = Orders::Builder.create!(attrs.compact, lines: lines, actor: nil, device: nil, branch: branch)
          order = builder.order
          Orders::Transitions.place!(order, actor: nil) unless cfg["cashier_accept"]
        end
      end
      Notification.create!(kind: "qr_order", title: "QR order from table #{table.code}#{guest_name.present? ? " (#{guest_name})" : ''}", body: cfg["cashier_accept"] ? "Waiting for a cashier to accept" : "Sent to the kitchen", link: "/orders/#{order.id}") if cfg["cashier_accept"]
      Realtime.order_changed(order)
      order
    end

    def accept!(order, actor:, device: nil)
      raise Api::Errors::Conflict.new("qr.not_pending", "Order is not waiting for acceptance") unless order.qr_status == "pending"
      Order.transaction do
        order.update!(qr_status: "accepted")
        if order.sent?
          Kitchen::Tickets.create_for!(order, kind: "changed", items: order.items.where(status: "pending").to_a)
          order.items.where(status: "pending").update_all(status: "sent", sent_at: Time.current)
        else
          Orders::Transitions.place!(order, actor: actor, device: device)
        end
      end
      Realtime.order_changed(order)
      order
    end

    def reject!(order, actor:, reason:)
      raise Api::Errors::Conflict.new("qr.not_pending", "Order is not waiting for acceptance") unless order.qr_status == "pending"
      order.update!(qr_status: "rejected")
      Orders::Transitions.void!(order, reason: "QR rejected: #{reason}", actor: actor, approver: nil) unless order.sent?
      order
    end

    def request!(table, kind:, guest_name: nil, note: nil)
      cfg = table.branch.qr_config
      raise Api::Errors::Conflict.new("qr.disabled", "Not available") unless cfg["enabled"] && cfg[kind == "ask_bill" ? "ask_bill" : "call_waiter"]
      open = TableRequest.open.where(table_id: table.id, kind: kind).first
      return open if open
      r = TableRequest.create!(branch_id: table.branch_id, table: table, kind: kind, guest_name: guest_name, note: note, requested_at: Time.current)
      Notification.create!(kind: "table_request", title: "#{kind == 'ask_bill' ? 'Bill requested' : 'Waiter called'} at table #{table.code}", body: guest_name.to_s, link: "/tables/#{table.id}")
      ActionCable.server.broadcast("orders:#{table.business_id}:#{table.branch_id}", { type: "table_request", request: { id: r.id, table_code: table.code, kind: kind, guest_name: guest_name } }) rescue nil
      r
    end
  end
end

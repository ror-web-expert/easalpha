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
      # SPEC: a hidden menu or category keeps its products off the customer-facing site while staff can still sell them.
      menus = Menu.active.where(show_online: true).order(:sort_order).select { |m| m.available_at?(Time.current, zone: business.time_zone) }
      categories = Category.active.where(menu_id: menus.map(&:id), show_online: true).order(:sort_order)
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
      { order_id: order.id, label: order.label, status: order.status, guest_name: order.guest_name, items: order.active_items.map { |i| { name: i.name_snapshot, quantity: i.quantity.to_s("F"), line_subtotal_minor: i.line_subtotal_minor, line_total_minor: i.line_total_minor } },
        subtotal_minor: order.subtotal_minor, discount_minor: order.discount_minor, service_charge_minor: order.service_charge_minor, tax_minor: order.tax_minor, tax_inclusive_minor: Receipts::Builder.inclusive_tax_minor(order),
        rounding_minor: order.rounding_minor, total_minor: order.total_minor, paid_minor: order.paid_minor }
    end

    # A guest's client id is a key for "this same submit again", never the order's id (review of 6 Nov 2026, A12).
    CLIENT_ID = /\A[\w-]{8,64}\z/
    # An add to the table's running order, recorded per table with the submit's key (AppliedSubmission).
    ADDED = "qr_add"

    # Places a guest order. With cashier_accept it stays a draft marked pending until a cashier accepts; otherwise it
    # goes straight to the kitchen. A table with an open order, whoever opened it (a guest whose first round still
    # waits for the cashier, or a waiter at the till), takes the round on that order (F4).
    def place!(table, lines:, guest_name: nil, notes: nil, client_id: nil)
      branch = table.branch
      cfg = branch.qr_config
      key = client_id.to_s.strip
      ref = key.match?(CLIENT_ID) ? "qr:#{key}" : nil
      if ref && (again = submitted(table, ref))
        return again # a retry of the same submit: the first order stands
      end
      raise Api::Errors::Conflict.new("qr.disabled", "Ordering is not available right now") unless cfg["enabled"]
      raise Api::Errors::Unprocessable.new("qr.guest_name", "Please tell us your name") if cfg["guest_name"] && guest_name.blank?
      raise Api::Errors::Unprocessable.new("qr.empty", "Add at least one item") if Array(lines).empty?
      # The round's lines carry the submit's key, so a cashier who turns the round away takes off those lines only.
      round = ref || "qr:#{SecureRandom.uuid}"
      order = nil
      repeat = false
      begin
        Order.transaction(requires_new: true) do
          # One submit at a time per table (F5): a second one, the same submit retried or sent twice at once, waits here
          # for the first to commit and then finds what it made. The keys' unique indexes back this up.
          locked = DiningTable.lock.find(table.id)
          if ref && (again = submitted(table, ref))
            repeat = true
            order = again
            next
          end
          existing = locked.current_order_id && Order.open.find_by(id: locked.current_order_id)
          if existing
            # The key goes in with the lines: a retry whose answer was lost adds nothing twice and is answered with
            # this order, even once it is paid and the table free.
            if ref && !AppliedSubmission.record!(record_type: ADDED, record_id: table.id, client_seq: ref, order_id: existing.id)
              repeat = true
              order = existing.reload
              next
            end
            order = add_round!(existing, lines: lines, guest_name: guest_name, round: round, cfg: cfg, branch: branch)
          else
            attrs = { order_type: "dine_in", source: "qr", table_id: table.id, guest_name: guest_name, notes: notes, aggregator_ref: ref, qr_status: cfg["cashier_accept"] ? "pending" : "accepted", qr_guest_token: SecureRandom.hex(8) }
            builder = Orders::Builder.create!(attrs.compact, lines: lines, actor: nil, device: nil, branch: branch)
            order = builder.order
            OrderItem.where(order_id: order.id).update_all(qr_ref: round)
            Orders::Transitions.place!(order, actor: nil) unless cfg["cashier_accept"]
          end
        end
      rescue ActiveRecord::RecordNotUnique
        again = ref && submitted(table, ref)
        return again if again
        raise
      end
      return order if repeat
      if order.qr_status == "pending"
        Notification.create!(kind: "qr_order", title: "QR order from table #{table.code}#{guest_name.present? ? " (#{guest_name})" : ''}", body: "Waiting for a cashier to accept", link: "/orders/#{order.id}")
      end
      Realtime.order_changed(order)
      order
    end

    # A guest's round on the table's open order. It waits for the cashier when orders are accepted first, and always
    # on an order the till has not sent yet: a guest never sends a waiter's unfinished order to the kitchen.
    def add_round!(existing, lines:, guest_name:, round:, cfg:, branch:)
      builder = Orders::Builder.new(existing, actor: nil, branch: branch)
      current = existing.active_items.map { |i| { id: i.id, product_id: i.product_id, variant_id: i.variant_id, deal_id: i.deal_id, quantity: i.quantity } }
      builder.update!(lines: current + Array(lines), attrs: { guest_name: existing.guest_name.presence || guest_name })
      OrderItem.where(id: builder.added.map(&:id)).update_all(qr_ref: round)
      if cfg["cashier_accept"] || !existing.sent?
        existing.update!(qr_status: "pending")
      else
        Orders::Transitions.after_edit!(existing, added: builder.added, removed: builder.removed)
      end
      existing
    end

    # The order a submit with this key made or was added to.
    def submitted(table, ref) = Order.find_by(source: "qr", table_id: table.id, aggregator_ref: ref) || added_to(table, ref)

    # The order an earlier submit with this key was added to.
    def added_to(table, ref)
      seen = AppliedSubmission.find_by(record_type: ADDED, record_id: table.id, client_seq: ref, device_id: nil)
      seen && Order.find_by(id: seen.order_id)
    end

    def accept!(order, actor:, device: nil)
      Order.transaction do
        hold!(order)
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

    # Turning away an order that is all the guests' rejects it whole, as before. A round on a running order (one the
    # kitchen has, or a waiter's not yet sent) takes off that round's lines only; the rest of the bill stands.
    def reject!(order, actor:, reason:)
      Order.transaction do
        hold!(order)
        round = waiting_round(order)
        if (order.active_items - round).empty?
          order.update!(qr_status: "rejected")
          Orders::Transitions.void!(order, reason: "QR rejected: #{reason}", actor: actor, approver: nil) unless order.sent?
        else
          round.each { |i| i.update!(status: "cancelled", cancelled_reason: "QR rejected: #{reason}") }
          order.items.reload
          Orders::Pricing.recalculate!(order)
          Orders::Pricing.save_all!(order)
          order.update!(qr_status: order.source == "qr" ? "accepted" : nil)
        end
      end
      Realtime.order_changed(order)
      order
    end

    # The guests' lines still waiting for the cashier, by the submit key on them. An order from before the keys were
    # kept treats every unsent line of a running order as the round, and the whole of a guest's unsent order.
    def waiting_round(order)
      waiting = order.items.reload.select { |i| i.status == "pending" }
      tagged = waiting.select(&:qr_ref)
      return tagged if tagged.any?
      order.sent? || order.source.in?(%w[qr online]) ? waiting : []
    end

    # The table, as a guest's submit takes it, then the order: a round on its way in, or a second cashier's tap, waits
    # and then sees the order as it is now.
    def hold!(order)
      DiningTable.lock.find_by(id: order.table_id) if order.table_id
      order.lock!
      raise Api::Errors::Conflict.new("qr.not_pending", "Order is not waiting for acceptance") unless order.qr_status == "pending"
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

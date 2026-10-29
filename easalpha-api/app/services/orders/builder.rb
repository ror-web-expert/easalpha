module Orders
  # Creates and edits orders from the till payload. Snapshots names, prices and tax at the time of sale.
  # lines: [{ id?, product_id, variant_id, quantity, notes, course, modifiers: [{ modifier_id, quantity }],
  #           open_item: { name, price_minor }, price_override_minor, deal_id, deal_choices: [{ product_id, variant_id, quantity }] }]
  class Builder
    attr_reader :order, :added, :removed, :approvals

    def initialize(order, actor:, device: nil, branch: nil)
      @order, @actor, @device = order, actor, device
      @branch = branch || order.branch
      @added, @removed, @approvals = [], [], {}
    end

    def self.create!(attrs, lines:, actor:, device:, branch:, approvals: {})
      shift = actor && Shift.open.find_by(cashier_membership_id: actor.id)
      order = Order.new(attrs.merge(branch: branch, device: device, taken_by_membership_id: actor&.id, shift_id: shift&.id))
      apply_charge_defaults!(order, attrs, branch.business)
      order.id = attrs[:id] if attrs[:id].present?
      order.business_day ||= branch.business_day_for(order.client_created_at || Time.current)
      builder = new(order, actor: actor, device: device, branch: branch)
      builder.approvals.merge!(approvals)
      builder.guard_charges!(default_charges(order.order_type, branch.business))
      Order.transaction do
        builder.validate_customer!
        order.save!
        builder.audit_charges!
        builder.apply_lines!(lines)
        Pricing.recalculate!(order)
        Marketing::RegularDiscounts.apply!(order) # SPEC: the till applies the best recency tier automatically
        Pricing.recalculate!(order)
        Pricing.save_all!(order)
        OrderStatusEvent.create!(order: order, from_status: nil, to_status: order.status, membership_id: actor&.id, device_id: device&.id, occurred_at: Time.current)
        builder.assign_table!(order.table_id) if order.table_id
      end
      builder
    end

    CHARGE_FIELDS = %i[service_charge_percent service_charge_fixed_minor delivery_charge_percent delivery_charge_minor].freeze

    # The keys a guest may send in a line (storefront, QR ordering). Prices, open items and approvals never come from
    # the public: a guest line is priced from the catalogue alone.
    GUEST_LINE_KEYS = %w[product_id variant_id quantity notes modifiers deal_id deal_choices course].freeze

    def self.guest_lines(lines)
      plain = ->(v) { (v.respond_to?(:to_unsafe_h) ? v.to_unsafe_h : v.to_h).with_indifferent_access }
      Array(lines).map do |l|
        h = plain.call(l).slice(*GUEST_LINE_KEYS)
        h[:modifiers] = Array(h[:modifiers]).map { |m| plain.call(m).slice("modifier_id", "quantity").to_h } if h.key?(:modifiers)
        h[:deal_choices] = Array(h[:deal_choices]).map { |c| plain.call(c).slice("product_id", "variant_id", "quantity").to_h } if h.key?(:deal_choices)
        h.to_h.symbolize_keys
      end
    end
    SERVICE_FIELDS = %i[service_charge_percent service_charge_fixed_minor].freeze

    # The four charge settings of an order, normalised so 10 and 10.0 compare equal.
    def self.charge_values(order)
      CHARGE_FIELDS.index_with { |f| v = order.public_send(f); f.to_s.end_with?("percent") ? v.to_d.to_s : v.to_i }
    end

    # What a fresh order of this type would carry from the settings.
    def self.default_charges(order_type, business)
      tmp = Order.new(order_type: order_type, delivery_charge_minor: 0, delivery_charge_percent: 0, service_charge_percent: 0, service_charge_fixed_minor: 0)
      apply_charge_defaults!(tmp, { order_type: order_type }, business)
      charge_values(tmp)
    end

    # Review 3.9 and Appendix A.6: a service charge set to anything but what the order already had (or the settings
    # default for its type) is a price change. It needs prices.override, or a manager PIN that holds it; the till hides
    # the control from roles without it. Every charge change, service or delivery, goes to the audit log with the old
    # and new values. The delivery charge is logged but not blocked: the till legitimately sets it from a zone quote.
    def guard_charges!(before)
      after = Builder.charge_values(order)
      return if after == before
      service_changed = SERVICE_FIELDS.any? { |f| after[f] != before[f] } && SERVICE_FIELDS.any? { |f| after[f] != Builder.default_charges(order.order_type, @branch.business)[f] }
      raise Api::Errors::Forbidden.new("approval.required", "A manager PIN is required to change the service charge") if service_changed && !can?("prices.override")
      @charge_audit = { before: before.select { |k, v| after[k] != v }, after: after.select { |k, v| before[k] != v } }
    end

    # Written after the order is saved, so the audit row points at a real record.
    def audit_charges!
      return unless @charge_audit
      approver = approvals["prices.override"]
      AuditLog.record(action: "price_change", record: order, before: @charge_audit[:before], after: @charge_audit[:after].merge(charge: true),
                      approved_by: approver && approver != @actor ? approver.user : nil)
      @charge_audit = nil
    end

    def self.service_charge_for(order_type, business)
      types = Array(business.setting("service_charge_order_types"))
      return 0 unless types.include?(order_type.to_s)
      v = business.setting("charges.service_charge.value").to_d
      v.zero? ? business.setting("service_charge_percent").to_d : v
    end

    # SPEC Charges: service charge and delivery charge are each a percent or a fixed amount, pre-filled on the order;
    # the cashier may change or remove either per order (the attrs win); zero or blank disables the default.
    def self.apply_charge_defaults!(order, attrs, business)
      value = service_charge_for(attrs[:order_type] || order.order_type || "walk_in", business)
      unless attrs.key?(:service_charge_percent) || attrs.key?(:service_charge_fixed_minor)
        if business.setting("charges.service_charge.mode").to_s == "fixed"
          order.service_charge_percent = 0
          order.service_charge_fixed_minor = (value * 100).round
        else
          order.service_charge_percent = value
          order.service_charge_fixed_minor = 0
        end
      end
      return unless (attrs[:order_type] || order.order_type).to_s == "delivery" && !attrs.key?(:delivery_charge_minor) && !attrs.key?(:delivery_charge_percent)
      dv = business.setting("charges.delivery_charge.value").to_d
      if business.setting("charges.delivery_charge.mode").to_s == "percent"
        order.delivery_charge_percent = dv
      elsif dv.positive? && order.delivery_charge_minor.to_i.zero?
        order.delivery_charge_minor = (dv * 100).round
      end
    end

    # Replace or amend lines. Existing lines are matched by id; lines not in the payload are cancelled (removed).
    def update!(attrs: {}, lines: nil, approvals: {})
      @approvals.merge!(approvals)
      raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
      raise Api::Errors::Conflict.new("day.locked", "#{order.business_day} is locked. A manager must reopen it first.") if order.business_day && DayClose.locked?(order.branch_id, order.business_day)
      Order.transaction do
        charges_before = Builder.charge_values(order)
        order.assign_attributes(attrs.except(:id))
        Builder.apply_charge_defaults!(order, attrs, order.business) if attrs.key?(:order_type) && order.order_type_changed?
        guard_charges!(charges_before)
        audit_charges!
        validate_customer! if order.customer_id_changed?
        apply_lines!(lines, amend: true) if lines
        reprice_lines! if attrs.key?(:order_type)
        Pricing.recalculate!(order)
        Marketing::RegularDiscounts.apply!(order) if order.customer_id_changed? || lines || attrs.key?(:order_type)
        Pricing.recalculate!(order)
        Pricing.save_all!(order)
        assign_table!(order.table_id) if order.table_id_changed? && order.table_id
      end
      self
    end

    def apply_lines!(lines, amend: false)
      keep = []
      Array(lines).each_with_index do |raw, idx|
        line = raw.to_h.with_indifferent_access
        existing = amend && line[:id].present? ? order.items.find { |i| i.id == line[:id] } : nil
        if existing && !existing.cancelled?
          update_existing!(existing, line, idx)
          keep << existing.id
        else
          item = build_item(line, idx)
          item.save!
          build_modifiers!(item, line[:modifiers])
          keep << item.id
          @added << item
        end
      end
      if amend
        order.items.reload.each do |i|
          next if keep.include?(i.id) || i.cancelled?
          cancel_item!(i, reason: "removed")
        end
      end
      order.items.reload
    end

    def validate_customer!
      return if order.customer_id.blank?
      customer = Customer.active.find(order.customer_id)
      raise Api::Errors::Conflict.new("customer.pending", "#{customer.name} is waiting for approval") if customer.status == "pending_approval"
      raise Api::Errors::Conflict.new("customer.deactivated", "#{customer.name} is deactivated") if customer.status == "deactivated"
    end

    def cancel_item!(item, reason:)
      raise Api::Errors::Forbidden.new("permission.denied", "Removing a sent item needs orders.edit_after_send") if item.sent_at && !can?("orders.edit_after_send")
      raise Api::Errors::Forbidden.new("permission.denied", "Deleting a line on a reopened order needs DELETE_ORDER_ITEM") if order.reopened? && !can?("DELETE_ORDER_ITEM")
      item.update!(status: "cancelled", cancelled_reason: reason)
      @removed << item
    end

    def assign_table!(table_id)
      table = DiningTable.active.find(table_id)
      raise Api::Errors::Conflict.new("table.occupied", "Table #{table.code} has an open order") if table.current_order_id && table.current_order_id != order.id && Order.open.where(id: table.current_order_id).exists?
      table.occupy!(order)
    end

    private

    # A guest (storefront, QR) has no actor and holds no permission: only a recorded approval allows a guarded step.
    def can?(code)
      return approvals[code].present? if @actor.nil?
      @actor.can?(code) || approvals[code].present?
    end

    def update_existing!(item, line, idx)
      changes = {}
      changes[:quantity] = line[:quantity].to_d if line.key?(:quantity) && line[:quantity].to_d != item.quantity
      changes[:notes] = line[:notes] if line.key?(:notes)
      changes[:course] = line[:course].to_i if line.key?(:course) && line[:course].to_i.positive?
      changes[:sort_order] = idx
      if line.key?(:price_override_minor) && line[:price_override_minor].present? && line[:price_override_minor].to_i != item.unit_price_minor
        authorize_override!
        changes.merge!(unit_price_minor: line[:price_override_minor].to_i, price_overridden: true, override_approved_by_id: approvals["prices.override"]&.id)
      end
      return if changes.except(:sort_order).empty?
      raise Api::Errors::Forbidden.new("permission.denied", "Changing a sent item needs orders.edit_after_send") if item.sent_at && !can?("orders.edit_after_send") && changes.except(:sort_order, :notes).any?
      raise Api::Errors::Forbidden.new("permission.denied", "Lowering a quantity on a reopened order needs MODIFY_REOPEN_DECREASE_QTY") if order.reopened? && changes.key?(:quantity) && changes[:quantity] < item.quantity_was.to_d && !can?("MODIFY_REOPEN_DECREASE_QTY")
      item.update!(changes)
      @added << item if item.sent_at && changes.key?(:quantity) && changes[:quantity] > item.quantity_was.to_d
    end

    def build_item(line, idx)
      if line[:deal_id].present?
        build_deal_item(line, idx)
      elsif line[:open_item].present?
        raise Api::Errors::Forbidden.new("permission.denied", "Open items need the items.open permission") unless can?("items.open")
        oi = line[:open_item]
        OrderItem.new(order: order, name_snapshot: oi[:name].presence || "Open item", unit_price_minor: oi[:price_minor].to_i, quantity: (line[:quantity].presence || 1).to_d,
                      open_item: true, tax_rate_snapshot: default_tax&.rate || 0, tax_inclusive_snapshot: default_tax&.inclusive || false, notes: line[:notes], course: (line[:course].presence || 1).to_i, sort_order: idx, station_id: line[:station_id])
      else
        product = Product.includes(:product_prices, :variants, :tax_rate).find(line[:product_id])
        raise Api::Errors::Unprocessable.new("product.inactive", "#{product.name} is not available") unless product.active && product.archived_at.nil?
        variant = line[:variant_id].present? ? product.variants.find { |v| v.id == line[:variant_id] } : nil
        price = product.price_for(order_type: order.order_type, variant: variant, branch_id: @branch.id)
        tax = product.tax_rate || default_tax
        item = OrderItem.new(order: order, product: product, variant: variant, name_snapshot: variant ? "#{product.name} (#{variant.name})" : product.name,
                             unit_price_minor: price, quantity: (line[:quantity].presence || 1).to_d, unit: product.sold_by_weight ? product.weight_unit : nil,
                             tax_rate_snapshot: tax&.rate || 0, tax_inclusive_snapshot: tax&.inclusive || false, notes: line[:notes],
                             course: (line[:course].presence || 1).to_i, sort_order: idx, station_id: product.station_id || product.category.station_id)
        if line[:price_override_minor].present? && line[:price_override_minor].to_i != price
          authorize_override!
          item.unit_price_minor = line[:price_override_minor].to_i
          item.price_overridden = true
          item.override_approved_by_id = approvals["prices.override"]&.id
        end
        item
      end
    end

    def build_deal_item(line, idx)
      deal = Deal.active.includes(deal_items: :product).find(line[:deal_id])
      raise Api::Errors::Unprocessable.new("deal.unavailable", "#{deal.name} is not available now") unless deal.available_at?(Time.current)
      components = deal.deal_items.map do |di|
        next if di.choice_group
        { product_id: di.product_id, variant_id: di.variant_id, quantity: di.quantity, name: di.product.name, station_id: di.product.station_id || di.product.category.station_id }
      end.compact
      # A choice must be one the deal offers (a deal item in a choice group); the deal, not the client, sets its quantity.
      options = deal.deal_items.select(&:choice_group)
      Array(line[:deal_choices]).each do |c|
        c = c.to_h.with_indifferent_access
        option = options.find { |di| di.product_id == c[:product_id] && (c[:variant_id].blank? || di.variant_id.nil? || di.variant_id == c[:variant_id]) }
        raise Api::Errors::Unprocessable.new("deal.choice_invalid", "#{deal.name} does not offer that choice") unless option
        product = option.product
        qty = option.quantity.to_d.positive? ? option.quantity : (c[:quantity].presence || 1).to_d
        components << { product_id: product.id, variant_id: c[:variant_id].presence || option.variant_id, quantity: qty, name: product.name, station_id: product.station_id || product.category.station_id }
      end
      tax = deal.tax_rate || default_tax
      OrderItem.new(order: order, deal: deal, name_snapshot: deal.name, unit_price_minor: deal.price_minor, quantity: (line[:quantity].presence || 1).to_d,
                    tax_rate_snapshot: tax&.rate || 0, tax_inclusive_snapshot: tax&.inclusive || false, notes: line[:notes], course: (line[:course].presence || 1).to_i,
                    sort_order: idx, deal_components: components, station_id: components.map { |c| c[:station_id] }.compact.first)
    end

    def build_modifiers!(item, mods)
      Array(mods).each do |m|
        m = m.to_h.with_indifferent_access
        modifier = Modifier.find(m[:modifier_id])
        OrderItemModifier.create!(order_item: item, modifier_id: modifier.id, name_snapshot: modifier.name, price_minor_snapshot: modifier.price_minor, quantity: (m[:quantity].presence || 1).to_d)
      end
      item.modifiers.reload
    end

    # SPEC: tax rates are linked to finance accounts; the cashier picks No Tax or the rate. Re-snapshots every line.
    def self.apply_tax_choice!(order, tax_rate: nil, none: false)
      raise Api::Errors::Conflict.new("order.not_editable", "This order can no longer be changed") unless order.editable?
      Order.transaction do
        order.items.reject(&:cancelled?).each do |i|
          i.tax_rate_snapshot = none ? 0 : tax_rate.rate
          i.tax_inclusive_snapshot = none ? false : tax_rate.inclusive
        end
        order.tax_choice = none ? "none" : "rate"
        order.tax_rate_id = none ? nil : tax_rate.id
        Pricing.recalculate!(order)
        Pricing.save_all!(order)
      end
      order
    end

    def reprice_lines!
      order.items.each do |i|
        next if i.cancelled? || i.open_item || i.price_overridden || i.product.nil?
        i.unit_price_minor = i.product.price_for(order_type: order.order_type, variant: i.variant, branch_id: @branch.id)
      end
    end

    def authorize_override!
      raise Api::Errors::Forbidden.new("approval.required", "A manager PIN is required to override a price") unless can?("prices.override")
    end

    def default_tax
      @default_tax ||= TaxRate.active.find_by(is_default: true)
    end
  end
end

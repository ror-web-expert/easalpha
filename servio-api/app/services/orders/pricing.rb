module Orders
  # Recomputes every money field on an order from its item snapshots and discounts. Deterministic and side-effect free until save!.
  # Order-level discounts are allocated to lines in proportion to line subtotals so tax is computed on the discounted amount.
  module Pricing
    module_function

    def recalculate!(order)
      items = order.items.to_a.reject(&:cancelled?)
      items.each do |i|
        i.modifiers_minor = i.modifiers.sum { |m| (m.price_minor_snapshot * m.quantity).round }
        i.line_subtotal_minor = ((i.unit_price_minor + i.modifiers_minor) * i.quantity).round
        i.line_discount_minor = 0
      end
      subtotal = items.sum(&:line_subtotal_minor)

      order.discounts.each do |d|
        if d.order_item_id
          line = items.find { |i| i.id == d.order_item_id } or next
          d.amount_minor = [discount_amount(d, line.line_subtotal_minor), line.line_subtotal_minor - line.line_discount_minor].min
          line.line_discount_minor += d.amount_minor
        else
          base = subtotal - items.sum(&:line_discount_minor)
          d.amount_minor = [discount_amount(d, base), base].min
          allocate(d.amount_minor, items)
        end
      end

      items.each do |i|
        base = i.line_subtotal_minor - i.line_discount_minor
        r = i.tax_rate_snapshot.to_d / 100
        if i.tax_inclusive_snapshot
          i.line_tax_minor = r.zero? ? 0 : (base - (base / (1 + r))).round
          i.line_total_minor = base
        else
          i.line_tax_minor = (base * r).round
          i.line_total_minor = base + i.line_tax_minor
        end
      end

      order.subtotal_minor = subtotal
      order.discount_minor = items.sum(&:line_discount_minor)
      net = subtotal - order.discount_minor
      order.service_charge_minor = (net * order.service_charge_percent.to_d / 100).round
      order.tax_minor = items.sum(&:line_tax_minor)
      order.total_minor = items.sum(&:line_total_minor) + order.service_charge_minor + order.delivery_charge_minor + order.rounding_minor + order.tip_minor
      order.total_minor = 0 if order.is_staff_meal
      order.payment_status = payment_status_for(order)
      order
    end

    def save_all!(order)
      order.save!
      order.items.each(&:save!)
      order.discounts.each(&:save!)
      order
    end

    def discount_amount(d, base)
      case d.kind
      when "percent", "promotion" then (base * d.value / 100).round
      when "fixed", "loyalty" then (d.value * 100).round
      else 0
      end
    end

    # Largest-remainder allocation so the parts sum exactly to the total.
    def allocate(amount, items)
      pool = items.map { |i| [i, i.line_subtotal_minor - i.line_discount_minor] }.reject { |_, v| v <= 0 }
      total = pool.sum { |_, v| v }
      return if total <= 0 || amount <= 0
      shares = pool.map { |i, v| [i, amount * v / total.to_f] }
      floors = shares.map { |i, s| [i, s.floor] }
      remainder = amount - floors.sum { |_, f| f }
      shares.zip(floors).sort_by { |(_, s), (_, f)| -(s - f) }.first(remainder).each { |_, pair| pair[1] += 1 }
      floors.each { |i, f| i.line_discount_minor += f }
    end

    def payment_status_for(order)
      return "refunded" if order.status == "refunded"
      return "paid" if order.total_minor.zero? && (order.is_staff_meal || order.paid_minor.zero? && order.status.in?(%w[paid closed]))
      return "unpaid" if order.paid_minor <= 0
      order.paid_minor >= order.total_minor ? "paid" : "partial"
    end
  end
end

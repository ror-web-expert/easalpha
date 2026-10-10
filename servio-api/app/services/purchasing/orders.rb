module Purchasing
  # Purchase orders: draft, sent, partially or fully received, cancelled.
  module Orders
    module_function

    def create!(attrs, lines:, actor:, branch:)
      PurchaseOrder.transaction do
        po = PurchaseOrder.new(attrs.merge(branch: branch, by_membership_id: actor&.id, status: "draft"))
        po.supplier = Supplier.active.find(attrs[:supplier_id])
        po.number = DocumentCounter.next!("purchase_order")
        po.save!
        replace_lines!(po, lines)
        po
      end
    end

    def replace_lines!(po, lines)
      raise Api::Errors::Conflict.new("purchase_order.status", "Only a draft can be edited") unless po.draft?
      po.lines.destroy_all
      Array(lines).each_with_index do |l, i|
        item = StockItem.active.find(l[:stock_item_id])
        unit = l[:unit_id].present? ? Unit.find(l[:unit_id]) : (item.purchase_unit || item.base_unit)
        cost = l[:unit_cost_minor].presence || last_price_for(po.supplier_id, item, unit) || 0
        po.lines.create!(stock_item: item, unit: unit, quantity: l[:quantity], unit_cost_minor: cost.to_i, sort_order: i)
      end
      po.lines.reload
      po.recompute_total!
    end

    def send!(po)
      raise Api::Errors::Conflict.new("purchase_order.status", "Order is #{po.status}") unless po.draft?
      raise Api::Errors::Conflict.new("purchase_order.no_lines", "Add at least one line") if po.lines.empty?
      po.update!(status: "sent", sent_at: Time.current)
      AuditLog.record(action: "po_send", record: po, after: { number: po.number, total_minor: po.total_minor })
      po
    end

    def cancel!(po, reason: nil)
      raise Api::Errors::Conflict.new("purchase_order.status", "A received order cannot be cancelled") if po.status == "received"
      raise Api::Errors::Conflict.new("purchase_order.partial", "Receive the rest or close it; goods were already received") if po.status == "partial"
      po.update!(status: "cancelled", cancelled_at: Time.current)
      AuditLog.record(action: "po_cancel", record: po, after: { reason: reason })
      po
    end

    # Receives the outstanding quantities (or the given per-line quantities) as a goods receipt.
    def receive!(po, actor:, branch:, section:, lines: nil, invoice_ref: nil, received_on: nil, note: nil)
      received_on ||= branch.business_day_for(Time.current)
      raise Api::Errors::Conflict.new("purchase_order.status", "Order is #{po.status}") unless po.open? || po.draft?
      send!(po) if po.draft?
      by_id = po.lines.index_by(&:id)
      receipt_lines = if lines.present?
        Array(lines).map do |l|
          pl = by_id[l[:purchase_order_line_id]] or raise Api::Errors::NotFound.new("purchase_order.line", "Unknown order line")
          { purchase_order_line_id: pl.id, stock_item_id: pl.stock_item_id, unit_id: l[:unit_id].presence || pl.unit_id, quantity: l[:quantity], unit_cost_minor: l[:unit_cost_minor].presence || pl.unit_cost_minor,
            batch_no: l[:batch_no], expires_on: l[:expires_on] }
        end
      else
        po.lines.select { |l| l.outstanding_base_qty.positive? }.map do |pl|
          qty = pl.stock_item.base_unit.convert(pl.outstanding_base_qty, to: pl.unit)
          { purchase_order_line_id: pl.id, stock_item_id: pl.stock_item_id, unit_id: pl.unit_id, quantity: qty, unit_cost_minor: pl.unit_cost_minor }
        end
      end
      raise Api::Errors::Conflict.new("purchase_order.nothing_outstanding", "Everything on this order was already received") if receipt_lines.empty?
      Receipts.create!({ supplier_id: po.supplier_id, purchase_order_id: po.id, invoice_ref: invoice_ref, received_on: received_on, note: note }, lines: receipt_lines, actor: actor, branch: branch, section: section)
    end

    def last_price_for(supplier_id, item, unit)
      row = SupplierPriceHistory.where(supplier_id: supplier_id, stock_item_id: item.id).order(observed_on: :desc, created_at: :desc).first
      return nil unless row
      (row.base_unit_cost_minor * unit.factor_to_base / item.base_unit.factor_to_base).round
    end
  end
end

module Purchasing
  # Goods received: posts a receive document into stock, raises the supplier balance, records the price history and updates the purchase order.
  module Receipts
    module_function

    def create!(attrs, lines:, actor:, branch:, section:)
      supplier = Supplier.active.find(attrs[:supplier_id])
      po = attrs[:purchase_order_id].present? ? PurchaseOrder.find(attrs[:purchase_order_id]) : nil
      received_on = attrs[:received_on].present? ? Date.parse(attrs[:received_on].to_s) : branch.business_day_for(Time.current)
      GoodsReceipt.transaction do
        grn = GoodsReceipt.create!(branch: branch, supplier: supplier, purchase_order: po, stock_section: section, number: DocumentCounter.next!("goods_receipt"), invoice_ref: attrs[:invoice_ref],
                                   invoice_key: attrs[:invoice_key], received_on: received_on, note: attrs[:note], by_membership_id: actor&.id)
        Array(lines).each do |l|
          item = StockItem.active.find(l[:stock_item_id])
          unit = l[:unit_id].present? ? Unit.find(l[:unit_id]) : (item.purchase_unit || item.base_unit)
          grn.lines.create!(stock_item: item, unit: unit, quantity: l[:quantity], unit_cost_minor: l[:unit_cost_minor].to_i, batch_no: l[:batch_no], expires_on: l[:expires_on], purchase_order_line_id: l[:purchase_order_line_id])
        end
        raise Api::Errors::Conflict.new("goods_receipt.no_lines", "Add at least one line") if grn.lines.empty?
        total = grn.lines.sum(&:line_total_minor)
        # SPEC: a receipt against a purchase order is a PO Receipt; one without is a Goods Receipt.
        doc = Stock::Posting.create!({ kind: po ? "po_receipt" : "receive", to_section_id: section.id, supplier_id: supplier.id, goods_receipt_id: grn.id, purchase_order_id: po&.id, invoice_ref: attrs[:invoice_ref], note: "#{grn.label} from #{supplier.name}" },
                                     lines: grn.lines.map { |l| { stock_item_id: l.stock_item_id, unit_id: l.unit_id, quantity: l.quantity, unit_cost_minor: l.unit_cost_minor, batch_no: l.batch_no, expires_on: l.expires_on } },
                                     actor: actor, branch: branch)
        Stock::Posting.post!(doc, actor: actor)
        grn.update!(stock_document: doc, total_minor: total, business_day: doc.business_day)
        Finance::Journal.inventory_receipt!(grn)
        supplier.move_balance!(total)
        grn.lines.each do |l|
          SupplierPriceHistory.create!(supplier: supplier, stock_item: l.stock_item, goods_receipt: grn, unit: l.unit, unit_cost_minor: l.unit_cost_minor, base_unit_cost_minor: l.base_unit_cost, observed_on: received_on)
          if l.purchase_order_line_id && (pl = PurchaseOrderLine.find_by(id: l.purchase_order_line_id))
            pl.update!(received_base_qty: pl.received_base_qty + l.base_quantity)
          end
        end
        po&.refresh_status!
        Recipes::Costing.recompute_all!
        AuditLog.record(action: "goods_receipt", record: grn, after: { supplier: supplier.name, total_minor: total, lines: grn.lines.size, document: doc.label })
        grn
      end
    end

    def cancel!(grn, actor:, reason: nil)
      raise Api::Errors::Conflict.new("goods_receipt.status", "Already cancelled") unless grn.posted?
      raise Api::Errors::Conflict.new("goods_receipt.returned", "Cancel the purchase return first") if grn.purchase_returns.where(status: "posted").exists?
      GoodsReceipt.transaction do
        Stock::Posting.cancel!(grn.stock_document, actor: actor, reason: reason || "cancelled #{grn.label}") if grn.stock_document&.posted?
        grn.supplier.move_balance!(-grn.total_minor)
        Finance::Journal.reverse_for!(grn, actor: actor)
        grn.lines.each do |l|
          if l.purchase_order_line_id && (pl = PurchaseOrderLine.find_by(id: l.purchase_order_line_id))
            pl.update!(received_base_qty: [ pl.received_base_qty - l.base_quantity, 0 ].max)
          end
        end
        SupplierPriceHistory.where(goods_receipt_id: grn.id).delete_all
        grn.update!(status: "cancelled", cancelled_at: Time.current)
        grn.purchase_order&.refresh_status!
        AuditLog.record(action: "goods_receipt_cancel", record: grn, after: { reason: reason })
      end
      grn
    end
  end
end

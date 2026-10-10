module Purchasing
  # Returns to a supplier: stock leaves through a supplier_return document; settled as a credit note (balance) or a cash refund (account entry).
  module Returns
    module_function

    def create!(attrs, lines:, actor:, branch:, section:, shift: nil)
      supplier = Supplier.active.find(attrs[:supplier_id])
      grn = attrs[:goods_receipt_id].present? ? GoodsReceipt.find(attrs[:goods_receipt_id]) : nil
      settlement = attrs[:settlement].presence_in(PurchaseReturn::SETTLEMENTS) || "credit_note"
      PurchaseReturn.transaction do
        ret = PurchaseReturn.create!(branch: branch, supplier: supplier, goods_receipt: grn, stock_section: section, number: DocumentCounter.next!("purchase_return"), reason: attrs[:reason],
                                     settlement: settlement, returned_on: Date.current, by_membership_id: actor&.id)
        grn_cost = grn ? grn.lines.index_by(&:stock_item_id) : {}
        Array(lines).each do |l|
          item = StockItem.active.find(l[:stock_item_id])
          unit = l[:unit_id].present? ? Unit.find(l[:unit_id]) : (grn_cost[item.id]&.unit || item.purchase_unit || item.base_unit)
          cost = l[:unit_cost_minor].presence || grn_cost[item.id]&.unit_cost_minor || (item.avg_cost_minor_per_base * unit.factor_to_base / item.base_unit.factor_to_base).round
          ret.lines.create!(stock_item: item, unit: unit, quantity: l[:quantity], unit_cost_minor: cost.to_i)
        end
        raise Api::Errors::Conflict.new("purchase_return.no_lines", "Add at least one line") if ret.lines.empty?
        amount = ret.lines.sum(&:line_total_minor)
        doc = Stock::Posting.create!({ kind: "supplier_return", from_section_id: section.id, supplier_id: supplier.id, reason: attrs[:reason].presence || "Returned to supplier", note: "#{ret.label} to #{supplier.name}" },
                                     lines: ret.lines.map { |l| { stock_item_id: l.stock_item_id, unit_id: l.unit_id, quantity: l.quantity, unit_cost_minor: l.unit_cost_minor } }, actor: actor, branch: branch)
        Stock::Posting.post!(doc, actor: actor)
        ret.update!(stock_document: doc, amount_minor: amount, business_day: doc.business_day)
        supplier.move_balance!(-amount)
        if settlement == "cash_refund"
          method = attrs[:method_code].present? ? PaymentMethod.active.find_by!(code: attrs[:method_code]) : PaymentMethod.active.find_by!(kind: "cash")
          account = method.cash? && shift&.drawer_account ? shift.drawer_account : method.payment_account
          ret.update!(payment_method: method, payment_account: account)
          account&.post!(kind: "supplier_payment", amount_minor: amount, business_day: doc.business_day, ref: ret, description: "Refund from #{supplier.name} for #{ret.label}", by: actor, shift_id: shift&.id, branch_id: branch.id)
          # A cash refund settles the credit immediately: the supplier no longer owes it.
          supplier.move_balance!(amount)
        end
        AuditLog.record(action: "purchase_return", record: ret, after: { supplier: supplier.name, amount_minor: amount, settlement: settlement, document: doc.label })
        ret
      end
    end
  end
end

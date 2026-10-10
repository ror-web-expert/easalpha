module Suppliers
  # SPEC Supplier Ledger: Dr and Cr lines typed Purchase, Payment, Adjustment, Return or Opening with a running balance,
  # each linked to its PO; headline tiles; FIFO aging of unpaid receipts; insights and ranking; the payables summary.
  module Ledger
    module_function

    # Credit = we owe the supplier more (purchases, opening, positive adjustments); debit = we owe less (payments, returns).
    def entries(supplier)
      rows = []
      if supplier.opening_balance_minor != 0
        rows << row(at: supplier.created_at, type: "Opening", kind: "opening", amount: supplier.opening_balance_minor, description: "Opening balance", business_day: supplier.created_at.to_date)
      end
      GoodsReceipt.where(supplier_id: supplier.id, status: "posted").includes(:purchase_order).each do |g|
        rows << row(at: g.created_at, type: "Purchase", kind: "receipt", amount: g.total_minor, number: g.label, ref: g.id, business_day: g.business_day, description: g.invoice_ref,
                    po_id: g.purchase_order_id, po_label: g.purchase_order&.label)
      end
      PurchaseReturn.where(supplier_id: supplier.id, status: "posted").includes(goods_receipt: :purchase_order).each do |r|
        rows << row(at: r.created_at, type: "Return", kind: "return", amount: -r.amount_minor, number: r.label, ref: r.id, business_day: r.business_day, description: r.settlement,
                    po_id: r.goods_receipt&.purchase_order_id, po_label: r.goods_receipt&.purchase_order&.label)
        rows << row(at: r.created_at + 1.second, type: "Payment", kind: "refund_received", amount: r.amount_minor, number: r.label, ref: r.id, business_day: r.business_day, description: "cash refund") if r.settlement == "cash_refund"
      end
      SupplierPayment.where(supplier_id: supplier.id).includes(:payment_method, :purchase_order).each do |p|
        rows << row(at: p.created_at, type: "Payment", kind: p.direction == "paid" ? "payment" : "received", amount: p.direction == "paid" ? -p.amount_minor : p.amount_minor, number: p.label, ref: p.id,
                    business_day: p.business_day, description: [ p.payment_method&.code, p.reference ].compact.join(" "), method: p.payment_method&.code, po_id: p.purchase_order_id, po_label: p.purchase_order&.label)
      end
      SupplierAdjustment.where(supplier_id: supplier.id).each do |a|
        rows << row(at: a.created_at, type: "Adjustment", kind: "adjustment", amount: a.amount_minor, ref: a.id, business_day: a.business_day, description: a.reason)
      end
      rows.sort_by! { |e| e[:at] }
      balance = 0
      rows.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
      rows
    end

    def row(at:, type:, kind:, amount:, business_day:, description: nil, number: nil, ref: nil, method: nil, po_id: nil, po_label: nil)
      { at: at, type: type, kind: kind, amount_minor: amount, debit_minor: amount.negative? ? -amount : 0, credit_minor: amount.positive? ? amount : 0, number: number, ref: ref,
        business_day: business_day, description: description, method: method, purchase_order_id: po_id, purchase_order_label: po_label }
    end

    # SPEC headline tiles: opening balance, total purchases, total payments and net balance owed.
    def tiles(supplier, rows = entries(supplier))
      { opening_minor: supplier.opening_balance_minor, purchases_minor: rows.select { |r| r[:kind] == "receipt" }.sum { |r| r[:amount_minor] },
        payments_minor: rows.select { |r| r[:kind] == "payment" }.sum { |r| -r[:amount_minor] }, returns_minor: rows.select { |r| r[:kind] == "return" }.sum { |r| -r[:amount_minor] },
        received_minor: rows.select { |r| r[:kind].in?(%w[received refund_received]) }.sum { |r| r[:amount_minor] }, adjustments_minor: rows.select { |r| r[:kind] == "adjustment" }.sum { |r| r[:amount_minor] },
        balance_minor: rows.last&.dig(:balance_minor) || supplier.opening_balance_minor, cached_balance_minor: supplier.balance_minor, ties_out: (rows.last&.dig(:balance_minor) || supplier.opening_balance_minor) == supplier.balance_minor }
    end

    def adjust!(supplier, amount_minor:, reason:, actor:, branch:)
      raise Api::Errors::BadRequest.new("adjustment.amount", "Amount cannot be zero") if amount_minor.zero?
      raise Api::Errors::BadRequest.new("adjustment.reason", "A reason is required") if reason.blank?
      SupplierAdjustment.transaction do
        adj = SupplierAdjustment.create!(supplier: supplier, branch_id: branch.id, amount_minor: amount_minor, reason: reason, business_day: branch.business_day_for(Time.current), by_membership_id: actor&.id)
        supplier.move_balance!(amount_minor)
        Finance::Journal.supplier_adjustment!(adj)
        AuditLog.record(action: "ledger_adjustment", record: adj, after: { supplier: supplier.name, amount_minor: amount_minor, reason: reason })
        adj
      end
    end

    def aging(supplier, as_of: Date.current)
      charges = GoodsReceipt.where(supplier_id: supplier.id, status: "posted").order(:received_on, :created_at).map { |g| [ g.received_on, g.total_minor ] }
      charges.unshift([ supplier.created_at.to_date, supplier.opening_balance_minor ]) if supplier.opening_balance_minor.positive?
      SupplierAdjustment.where(supplier_id: supplier.id).where("amount_minor > 0").order(:business_day).each { |a| charges << [ a.business_day, a.amount_minor ] }
      charges.sort_by!(&:first)
      credits = SupplierPayment.where(supplier_id: supplier.id, direction: "paid").sum(:amount_minor) - SupplierPayment.where(supplier_id: supplier.id, direction: "received").sum(:amount_minor) +
                PurchaseReturn.where(supplier_id: supplier.id, status: "posted", settlement: "credit_note").sum(:amount_minor) - SupplierAdjustment.where(supplier_id: supplier.id).where("amount_minor < 0").sum(:amount_minor)
      remaining = [ credits, 0 ].max
      buckets = { "current" => 0, "31_60" => 0, "61_90" => 0, "over_90" => 0 }
      charges.each do |day, amount|
        if remaining >= amount
          remaining -= amount
          next
        end
        open_amount = amount - remaining
        remaining = 0
        age = (as_of - day).to_i
        key = age <= 30 ? "current" : age <= 60 ? "31_60" : age <= 90 ? "61_90" : "over_90"
        buckets[key] += open_amount
      end
      buckets.merge("total" => buckets.values.sum)
    end

    def aging_report(as_of: Date.current)
      rows = Supplier.active.where("balance_minor > 0").order(balance_minor: :desc).map { |s| { supplier: SupplierSerializers.supplier(s), aging: aging(s, as_of: as_of) } }
      totals = %w[current 31_60 61_90 over_90 total].index_with { |k| rows.sum { |r| r[:aging][k] } }
      { as_of: as_of, rows: rows, totals: totals, suppliers_with_due: rows.size }
    end

    def insights(supplier, from: Date.current - 90, to: Date.current)
      receipts = GoodsReceipt.where(supplier_id: supplier.id, status: "posted", received_on: from..to)
      items = GoodsReceiptLine.joins(:goods_receipt).where(goods_receipts: { id: receipts.select(:id) }).includes(:stock_item, :unit).group_by(&:stock_item_id).map do |_, ls|
        { item: StockSerializers.item(ls.first.stock_item), receipts: ls.size, quantity: ls.sum(&:base_quantity).to_s, value_minor: ls.sum(&:line_total_minor),
          last_unit_cost_minor: ls.max_by { |l| l.goods_receipt.received_on }.unit_cost_minor, unit_code: ls.first.unit.code }
      end.sort_by { |r| -r[:value_minor] }
      pays = SupplierPayment.where(supplier_id: supplier.id, direction: "paid", paid_on: from..to)
      { from: from, to: to, purchases_minor: receipts.sum(:total_minor), receipts: receipts.count, returns_minor: PurchaseReturn.where(supplier_id: supplier.id, status: "posted", returned_on: from..to).sum(:amount_minor),
        paid_minor: pays.sum(:amount_minor), payments: pays.count, last_receipt_on: GoodsReceipt.where(supplier_id: supplier.id, status: "posted").maximum(:received_on),
        open_orders: PurchaseOrder.where(supplier_id: supplier.id, status: %w[sent partial]).count, balance_minor: supplier.balance_minor, top_items: items.first(10) }
    end

    # SPEC Supplier Insights: rank suppliers by purchased, paid, outstanding or name, with PO count and last purchase date.
    def ranking(sort: "purchased", from: nil, to: nil)
      suppliers = Supplier.active.to_a
      ids = suppliers.map(&:id)
      receipts = GoodsReceipt.where(supplier_id: ids, status: "posted")
      receipts = receipts.where(received_on: from..to) if from && to
      purchased = receipts.group(:supplier_id).sum(:total_minor)
      last = GoodsReceipt.where(supplier_id: ids, status: "posted").group(:supplier_id).maximum(:received_on)
      pays = SupplierPayment.where(supplier_id: ids, direction: "paid")
      pays = pays.where(paid_on: from..to) if from && to
      paid = pays.group(:supplier_id).sum(:amount_minor)
      pos = PurchaseOrder.where(supplier_id: ids).where.not(status: "cancelled").group(:supplier_id).count
      counts = SupplierSerializers.supplier_counts(ids)
      rows = suppliers.map do |s|
        { supplier: SupplierSerializers.supplier(s, counts: counts), purchased_minor: purchased[s.id] || 0, paid_minor: paid[s.id] || 0, outstanding_minor: s.balance_minor, po_count: pos[s.id] || 0, last_purchase_on: last[s.id] }
      end
      rows = case sort.to_s
      when "paid" then rows.sort_by { |r| -r[:paid_minor] }
      when "outstanding" then rows.sort_by { |r| -r[:outstanding_minor] }
      when "name" then rows.sort_by { |r| r[:supplier][:name].downcase }
      else rows.sort_by { |r| -r[:purchased_minor] }
      end
      { sort: sort, from: from, to: to, rows: rows, totals: { purchased_minor: rows.sum { |r| r[:purchased_minor] }, paid_minor: rows.sum { |r| r[:paid_minor] }, outstanding_minor: rows.sum { |r| r[:outstanding_minor] } } }
    end

    def summary
      { payables_minor: Supplier.active.where("balance_minor > 0").sum(:balance_minor), receivables_minor: -Supplier.active.where("balance_minor < 0").sum(:balance_minor),
        suppliers_with_due: Supplier.active.where("balance_minor > 0").count, suppliers: Supplier.active.count,
        open_purchase_orders: PurchaseOrder.where(status: %w[sent partial]).count, open_purchase_orders_minor: PurchaseOrder.where(status: %w[sent partial]).sum(:total_minor),
        received_this_month_minor: GoodsReceipt.where(status: "posted").where("received_on >= ?", Date.current.beginning_of_month).sum(:total_minor),
        paid_this_month_minor: SupplierPayment.where(direction: "paid").where("paid_on >= ?", Date.current.beginning_of_month).sum(:amount_minor) }
    end
  end
end

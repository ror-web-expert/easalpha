module Suppliers
  # Supplier ledger with running balance, FIFO aging of unpaid receipts, insights and the payables summary.
  module Ledger
    module_function

    def entries(supplier)
      rows = []
      rows << { at: supplier.created_at, kind: "opening", amount_minor: supplier.opening_balance_minor, description: "Opening balance" } if supplier.opening_balance_minor != 0
      GoodsReceipt.where(supplier_id: supplier.id, status: "posted").each { |g| rows << { at: g.created_at, kind: "receipt", amount_minor: g.total_minor, number: g.label, ref: g.id, business_day: g.business_day, description: g.invoice_ref } }
      PurchaseReturn.where(supplier_id: supplier.id, status: "posted").each { |r| rows << { at: r.created_at, kind: "return", amount_minor: -r.amount_minor, number: r.label, ref: r.id, business_day: r.business_day, description: r.settlement } }
      PurchaseReturn.where(supplier_id: supplier.id, status: "posted", settlement: "cash_refund").each { |r| rows << { at: r.created_at + 1.second, kind: "refund_received", amount_minor: r.amount_minor, number: r.label, ref: r.id, business_day: r.business_day, description: "cash refund" } }
      SupplierPayment.where(supplier_id: supplier.id).includes(:payment_method).each do |p|
        rows << { at: p.created_at, kind: p.direction == "paid" ? "payment" : "received", amount_minor: p.direction == "paid" ? -p.amount_minor : p.amount_minor, number: p.label, ref: p.id,
                  business_day: p.business_day, description: [p.payment_method&.code, p.reference].compact.join(" "), method: p.payment_method&.code }
      end
      rows.sort_by! { |e| e[:at] }
      balance = 0
      rows.each { |e| balance += e[:amount_minor]; e[:balance_minor] = balance }
      rows
    end

    def aging(supplier, as_of: Date.current)
      charges = GoodsReceipt.where(supplier_id: supplier.id, status: "posted").order(:received_on, :created_at).map { |g| [g.received_on, g.total_minor] }
      charges.unshift([supplier.created_at.to_date, supplier.opening_balance_minor]) if supplier.opening_balance_minor.positive?
      credits = SupplierPayment.where(supplier_id: supplier.id, direction: "paid").sum(:amount_minor) - SupplierPayment.where(supplier_id: supplier.id, direction: "received").sum(:amount_minor) +
                PurchaseReturn.where(supplier_id: supplier.id, status: "posted", settlement: "credit_note").sum(:amount_minor)
      remaining = [credits, 0].max
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

    def summary
      { payables_minor: Supplier.active.where("balance_minor > 0").sum(:balance_minor), receivables_minor: -Supplier.active.where("balance_minor < 0").sum(:balance_minor),
        suppliers_with_due: Supplier.active.where("balance_minor > 0").count, suppliers: Supplier.active.count,
        open_purchase_orders: PurchaseOrder.where(status: %w[sent partial]).count, open_purchase_orders_minor: PurchaseOrder.where(status: %w[sent partial]).sum(:total_minor),
        received_this_month_minor: GoodsReceipt.where(status: "posted").where("received_on >= ?", Date.current.beginning_of_month).sum(:total_minor),
        paid_this_month_minor: SupplierPayment.where(direction: "paid").where("paid_on >= ?", Date.current.beginning_of_month).sum(:amount_minor) }
    end
  end
end

module Purchasing
  # SPEC Purchase Price History: what you actually paid per item against the average cost sales are booked at, over a
  # window, with a plain verdict for items that need a look (most are unit-entry mistakes on the purchase line).
  module PriceHistory
    module_function

    VERDICTS = { ok: "OK", wrong_unit: "Wrong unit on a purchase", below: "Valued below what you pay", above: "Valued above what you pay", no_cost: "No average cost yet" }.freeze

    def rows(from:, to:, flagged_only: false, q: nil)
      scope = SupplierPriceHistory.where(observed_on: from..to).includes(:unit, stock_item: :base_unit)
      lines = GoodsReceiptLine.joins(:goods_receipt).where(goods_receipts: { status: "posted", received_on: from..to }).includes(:unit, stock_item: :base_unit).to_a
      by_item = lines.group_by(&:stock_item_id)
      rows = by_item.map do |item_id, ls|
        item = ls.first.stock_item
        next if q.present? && !item.name.downcase.include?(q.downcase)
        qty = ls.sum(&:base_quantity)
        spent = ls.sum(&:line_total_minor)
        paid_avg = qty.positive? ? (spent.to_d / qty) : 0.to_d # per base unit
        last = scope.where(stock_item_id: item_id).order(observed_on: :desc, created_at: :desc).first || ls.max_by { |l| l.goods_receipt.received_on }
        last_price = last.is_a?(SupplierPriceHistory) ? { unit_cost_minor: last.unit_cost_minor, unit_code: last.unit&.code, on: last.observed_on, supplier: last.supplier&.name } : { unit_cost_minor: last.unit_cost_minor, unit_code: last.unit.code, on: last.goods_receipt.received_on }
        avg_cost = item.avg_cost_minor_per_base.to_d
        diff = avg_cost.positive? && paid_avg.positive? ? ((paid_avg - avg_cost) / avg_cost * 100).round(1) : nil
        verdict = verdict_for(paid_avg: paid_avg, avg_cost: avg_cost, lines: ls)
        { item: StockSerializers.item(item), unit_code: item.base_unit.code, bought_qty: qty.to_s("F"), purchases: ls.size, spent_minor: spent, paid_avg_minor_per_base: paid_avg.round(4).to_s("F"),
          last_price: last_price, avg_cost_minor_per_base: avg_cost.round(4).to_s("F"), difference_percent: diff&.to_f, verdict: verdict, verdict_text: VERDICTS[verdict], flagged: verdict != :ok }
      end.compact
      rows = rows.select { |r| r[:flagged] } if flagged_only
      rows.sort_by { |r| [r[:flagged] ? 0 : 1, -r[:spent_minor]] }
    end

    # A single purchase priced 20x off the others means the unit on that line is wrong; a steady gap means the
    # booked average is stale against what is being paid.
    def verdict_for(paid_avg:, avg_cost:, lines:)
      per_base = lines.map { |l| l.base_quantity.positive? ? l.line_total_minor.to_d / l.base_quantity : nil }.compact
      if per_base.size > 1
        med = per_base.sort[per_base.size / 2]
        return :wrong_unit if med.positive? && per_base.any? { |p| p > med * 20 || p < med / 20 }
      end
      return :no_cost if avg_cost.zero?
      return :ok if paid_avg.zero?
      return :wrong_unit if paid_avg > avg_cost * 20 || paid_avg < avg_cost / 20
      return :below if avg_cost < paid_avg * 0.8
      return :above if avg_cost > paid_avg * 1.25
      :ok
    end

    def summary(rows) = { items: rows.size, flagged: rows.count { |r| r[:flagged] }, spent_minor: rows.sum { |r| r[:spent_minor] } }
  end
end

module Purchasing
  # Reorder suggestions from minimums, and a usage-based forecast with a budget cap (decision 7: AI version in Phase 4).
  module Demand
    module_function

    def suggestions(branch:)
      StockItem.active.includes(:base_unit, :purchase_unit, :stock_levels).select(&:below_minimum?).map do |i|
        on_hand = i.total_quantity
        qty = [ i.reorder_qty.positive? ? i.reorder_qty : (i.minimum_qty * 2 - on_hand), i.minimum_qty - on_hand ].max
        price = last_price(i)
        { item: StockSerializers.item(i), on_hand: on_hand.to_s, minimum: i.minimum_qty.to_s, suggested_qty: qty.round(3).to_s, unit_code: i.base_unit.code,
          supplier: price && SupplierSerializers.supplier(price.supplier), est_cost_minor: ((price&.base_unit_cost_minor || i.avg_cost_minor_per_base) * qty).round }
      end.sort_by { |r| -r[:est_cost_minor] }
    end

    def forecast(branch:, lookback_days: 30, forecast_days: 7, safety_percent: 10, budget_minor: nil, category: nil)
      today = branch.business_day_for(Time.current)
      from = today - lookback_days
      usage = StockLedgerEntry.where(branch_id: branch.id, kind: %w[sale sale_return packaging production_out], business_day: from..today).group(:stock_item_id).sum(:quantity)
      items = StockItem.active.includes(:base_unit, :stock_levels).where(id: usage.keys)
      items = items.where(category: category) if category.present?
      rows = items.map do |i|
        used = -usage[i.id]
        next if used <= 0
        daily = used / lookback_days
        need = daily * forecast_days * (1 + safety_percent.to_d / 100)
        on_hand = i.total_quantity
        order_qty = [ need - on_hand, 0 ].max.round(3)
        price = last_price(i)
        cost_per_base = price&.base_unit_cost_minor || i.avg_cost_minor_per_base
        { item: StockSerializers.item(i), daily_usage: daily.round(3).to_s, on_hand: on_hand.to_s, days_left: daily.positive? ? (on_hand / daily).floor : nil, needed: need.round(3).to_s,
          order_qty: order_qty.to_s, unit_code: i.base_unit.code, est_cost_minor: (cost_per_base * order_qty).round, supplier: price && SupplierSerializers.supplier(price.supplier) }
      end.compact.sort_by { |r| r[:days_left] || 10**9 }
      total = rows.sum { |r| r[:est_cost_minor] }
      capped = []
      if budget_minor && total > budget_minor
        left = budget_minor
        rows.each do |r|
          if r[:est_cost_minor] <= left
            left -= r[:est_cost_minor]
            capped << r.merge(within_budget: true)
          else
            capped << r.merge(within_budget: false)
          end
        end
        rows = capped
      end
      { lookback_days: lookback_days, forecast_days: forecast_days, safety_percent: safety_percent, budget_minor: budget_minor, total_cost_minor: total,
        within_budget_minor: rows.sum { |r| r[:within_budget] == false ? 0 : r[:est_cost_minor] }, rows: rows }
    end

    def last_price(item)
      SupplierPriceHistory.where(stock_item_id: item.id).includes(:supplier).order(observed_on: :desc, created_at: :desc).first
    end
  end
end

module Stock
  # SPEC Demand: what to restock. Buckets items by Low, Critical, Out of stock, checks each item's stock against its
  # minimum and recent usage, subtracts what is already on order, and splits the answer into what to transfer and what to buy.
  module Demand
    BUCKETS = %w[low critical out all_needing everything].freeze
    module_function

    def build(branch:, section_id: nil, category: nil, bucket: "all_needing", lookback_days: 14)
      items = StockItem.active.where(active: true).includes(:base_unit, :stock_levels)
      items = items.where(category: category) if category.present?
      on_order = PurchaseOrderLine.joins(:purchase_order).where(purchase_orders: { status: %w[sent partial] }).group(:stock_item_id)
                                  .pluck(:stock_item_id, Arel.sql("SUM(base_quantity - received_base_qty)")).to_h
      usage = StockLedgerEntry.where(branch_id: branch.id, kind: %w[sale packaging production_out], business_day: (branch.business_day_for(Time.current) - lookback_days)..branch.business_day_for(Time.current))
                              .group(:stock_item_id).sum(:quantity).transform_values { |q| -q / lookback_days }
      rows = items.map do |i|
        levels = i.stock_levels.to_a
        in_section = (section_id.present? ? levels.select { |l| l.stock_section_id == section_id.to_s }.sum(&:quantity) : levels.sum(&:quantity)).to_d
        total = levels.sum(&:quantity).to_d
        min = i.minimum_qty.to_d
        daily = (usage[i.id] || 0).to_d
        b = if in_section <= 0 then "out"
        elsif min.positive? && in_section < min / 2 then "critical"
        elsif min.positive? && in_section < min then "low"
        else "ok"
        end
        next if bucket == "all_needing" && b == "ok"
        next if bucket.in?(%w[low critical out]) && b != bucket
        next if bucket == "everything" && daily.zero? && b == "ok"
        target = [ min * 2, (daily * 7).ceil.to_d ].max
        need = [ target - in_section - on_order[i.id].to_d, 0.to_d ].max
        # Transfer when another section holds more than it needs; buy the rest.
        elsewhere = section_id.present? ? [ total - in_section, 0.to_d ].max : 0.to_d
        transfer = [ elsewhere, need ].min
        buy = need - transfer
        { item: StockSerializers.item(i), bucket: b, on_hand: in_section.to_s("F"), total_on_hand: total.to_s("F"), minimum: min.to_s("F"), daily_usage: daily.round(3).to_s("F"),
          days_left: daily.positive? ? (in_section / daily).floor : nil, on_order: on_order[i.id].to_d.to_s("F"), transfer_qty: transfer.to_s("F"), buy_qty: buy.to_s("F"),
          unit_code: i.base_unit.code, est_cost_minor: (buy * i.avg_cost_minor_per_base).round }
      end.compact
      order = { "out" => 0, "critical" => 1, "low" => 2, "ok" => 3 }
      rows = rows.sort_by { |r| [ order[r[:bucket]], -r[:est_cost_minor] ] }
      { bucket: bucket, section_id: section_id, lookback_days: lookback_days, rows: rows,
        counts: %w[low critical out].to_h { |k| [ k, rows.count { |r| r[:bucket] == k } ] }, transfer_count: rows.count { |r| r[:transfer_qty].to_d.positive? }, buy_cost_minor: rows.sum { |r| r[:est_cost_minor] } }
    end
  end
end

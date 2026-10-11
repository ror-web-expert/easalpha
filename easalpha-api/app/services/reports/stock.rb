module Reports
  # Stock levels, valuation, the daily stock sheet, waste and adjustments, low stock.
  module Stock
    module_function

    def fmt(x) = BigDecimal(x.to_s).to_s

    SHEET_COLUMNS = { "in" => %w[receive transfer_in production_in opening], "out" => %w[transfer_out production_out supplier_return], "waste" => %w[waste],
                      "sale" => %w[sale sale_return packaging], "adjusted" => %w[adjustment count] }.freeze

    def levels(section_id: nil, q: nil, low_only: false)
      items = StockItem.active.includes(:base_unit).order(:name)
      items = items.where("stock_items.name ILIKE :q OR stock_items.sku ILIKE :q OR stock_items.category ILIKE :q", q: "%#{q}%") if q.present?
      levels = StockLevel.where(stock_item_id: items.map(&:id))
      levels = levels.where(stock_section_id: section_id) if section_id.present?
      by_item = levels.group_by(&:stock_item_id)
      rows = items.map do |i|
        ls = by_item[i.id] || []
        qty = ls.sum(&:quantity)
        { item: StockSerializers.item(i), quantity: fmt(qty), value_minor: (qty * i.avg_cost_minor_per_base).round, below_minimum: i.minimum_qty.positive? && qty < i.minimum_qty,
          negative: qty.negative?, sections: ls.map { |l| { section_id: l.stock_section_id, quantity: l.quantity.to_s, value_minor: l.value_minor } } }
      end
      rows = rows.select { |r| r[:below_minimum] || r[:negative] } if low_only
      { rows: rows, total_value_minor: rows.sum { |r| r[:value_minor] }, negative_count: rows.count { |r| r[:negative] }, below_minimum_count: rows.count { |r| r[:below_minimum] } }
    end

    def valuation
      StockSection.active.includes(:branch).map do |s|
        { section: StockSerializers.section(s), value_minor: StockLevel.where(stock_section_id: s.id).sum(:value_minor), items: StockLevel.where(stock_section_id: s.id).where.not(quantity: 0).count }
      end
    end

    # SPEC Actual vs Theoretical: counts post the difference between what recipes say should remain and what was found,
    # so over a period the count entries are the variance; waste is shown beside it.
    def actual_vs_theoretical(branch:, from:, to:, section_id: nil)
      entries = StockLedgerEntry.where(branch_id: branch.id, business_day: from..to)
      entries = entries.where(stock_section_id: section_id) if section_id
      counts = entries.where(kind: "count").group(:stock_item_id).sum(:quantity)
      waste = entries.where(kind: "waste").group(:stock_item_id).sum(:quantity)
      sales = entries.where(kind: %w[sale packaging sale_return]).group(:stock_item_id).sum(:quantity)
      closing = StockLedgerEntry.where(branch_id: branch.id).where("business_day <= ?", to)
      closing = closing.where(stock_section_id: section_id) if section_id
      actual = closing.group(:stock_item_id).sum(:quantity)
      ids = (counts.keys + sales.keys).uniq
      items = StockItem.where(id: ids).includes(:base_unit).index_by(&:id)
      rows = ids.filter_map do |id|
        i = items[id] or next
        a = (actual[id] || 0).to_d
        variance = (counts[id] || 0).to_d
        { item: StockSerializers.item(i), unit_code: i.base_unit.code, theoretical: (a - variance).to_s("F"), actual: a.to_s("F"), variance: variance.to_s("F"),
          variance_value_minor: (variance * i.avg_cost_minor_per_base).round, used_by_sales: (-(sales[id] || 0).to_d).to_s("F"), waste: (-(waste[id] || 0).to_d).to_s("F"), counted: counts.key?(id) }
      end.sort_by { |r| -r[:variance_value_minor].abs }
      { from: from, to: to, section_id: section_id, rows: rows, variance_value_minor: rows.sum { |r| r[:variance_value_minor] } }
    end

    # SPEC Valuation & COGS: stock value by section and item plus cost of goods sold for the period from sale movements.
    def valuation_cogs(branch:, from:, to:)
      sold = StockLedgerEntry.where(branch_id: branch.id, kind: %w[sale packaging sale_return], business_day: from..to)
      cogs_by_item = sold.group(:stock_item_id).sum(:value_minor).transform_values { |v| -v }
      items = StockItem.where(id: cogs_by_item.keys).includes(:base_unit).index_by(&:id)
      by_item = cogs_by_item.map { |id, v| items[id] && { item: StockSerializers.item(items[id]), cogs_minor: v } }.compact.sort_by { |r| -r[:cogs_minor] }
      by_category = by_item.group_by { |r| r[:item][:category].presence || "Uncategorised" }.map { |c, rs| { category: c, cogs_minor: rs.sum { |r| r[:cogs_minor] } } }.sort_by { |r| -r[:cogs_minor] }
      revenue = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed]).sum(:total_minor) - Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed]).sum(:tax_minor)
      cogs = by_item.sum { |r| r[:cogs_minor] }
      { from: from, to: to, valuation: valuation, stock_value_minor: StockLevel.sum(:value_minor), cogs_minor: cogs, revenue_minor: revenue,
        gross_margin_percent: revenue.positive? ? ((revenue - cogs) * 100.0 / revenue).round(1) : nil, cogs_by_category: by_category, cogs_by_item: by_item.first(50) }
    end

    # Opening, in, out, waste, sale, adjusted, closing per item for one section and business day.
    def daily_sheet(section:, day:)
      entries = StockLedgerEntry.where(stock_section_id: section.id)
      opening = entries.where("business_day < ?", day).group(:stock_item_id).sum(:quantity)
      today = entries.where(business_day: day).group(:stock_item_id, :kind).sum(:quantity)
      item_ids = (opening.keys + today.keys.map(&:first)).uniq
      items = StockItem.where(id: item_ids).includes(:base_unit).index_by(&:id)
      rows = item_ids.filter_map do |id|
        item = items[id] or next
        cols = SHEET_COLUMNS.transform_values { |kinds| kinds.sum { |k| today[[ id, k ]] || 0 } }
        open = opening[id] || 0
        close = open + cols.values.sum
        { item: StockSerializers.item(item), opening: fmt(open), in: fmt(cols["in"]), out: fmt(cols["out"]), waste: fmt(cols["waste"]), sale: fmt(cols["sale"]), adjusted: fmt(cols["adjusted"]),
          closing: fmt(close), closing_value_minor: (close * item.avg_cost_minor_per_base).round }
      end.sort_by { |r| r[:item][:name] }
      { section: StockSerializers.section(section), business_day: day, rows: rows, closing_value_minor: rows.sum { |r| r[:closing_value_minor] } }
    end

    def waste(from:, to:, group_by: "reason")
      scope = StockLedgerEntry.where(kind: %w[waste adjustment count], business_day: from..to, reverses_entry_id: nil, reversed_by_entry_id: nil).includes(:stock_item, :stock_section)
      groups = scope.group_by { |e| group_by == "item" ? e.stock_item.name : (e.reason.presence || e.kind) }
      rows = groups.map do |key, es|
        { key: key, entries: es.size, quantity: fmt(es.sum(&:quantity)), value_minor: es.sum(&:value_minor), waste_value_minor: es.select { |e| e.kind == "waste" }.sum(&:value_minor) }
      end.sort_by { |r| r[:value_minor] }
      { from: from, to: to, group_by: group_by, rows: rows, total_value_minor: rows.sum { |r| r[:value_minor] },
        entries: scope.order(occurred_at: :desc).limit(200).map { |e| StockSerializers.ledger_entry(e) } }
    end
  end
end

require "csv"

module Stock
  # CSV columns: name, sku, category, unit, purchase_unit, minimum, reorder, opening_qty, cost, section. The ArfaPOS Items export maps onto these.
  class Import
    Row = Struct.new(:line, :name, :sku, :category, :unit, :purchase_unit, :minimum, :reorder, :opening_qty, :cost, :section, :error, keyword_init: true)
    ALIASES = { "item" => "name", "item name" => "name", "item_name" => "name", "code" => "sku", "base unit" => "unit", "base_unit" => "unit", "uom" => "unit", "min" => "minimum", "minimum_qty" => "minimum",
                "min_qty" => "minimum", "reorder_qty" => "reorder", "opening" => "opening_qty", "opening stock" => "opening_qty", "quantity" => "opening_qty", "qty" => "opening_qty", "unit_cost" => "cost",
                "cost_price" => "cost", "avg_cost" => "cost", "store" => "section", "location" => "section" }.freeze
    attr_reader :rows

    def initialize(data)
      @data = data
      @rows = []
    end

    def parse
      units = Unit.active.pluck(:code).to_set
      CSV.parse(@data.to_s, headers: true, header_converters: ->(h) { h = h.to_s.strip.downcase; ALIASES[h] || h.tr(" ", "_") }).each_with_index do |r, i|
        row = Row.new(line: i + 2, name: r["name"].to_s.strip, sku: r["sku"].presence, category: r["category"].presence, unit: r["unit"].to_s.strip.downcase.presence || "pcs",
                      purchase_unit: r["purchase_unit"].to_s.strip.downcase.presence, minimum: r["minimum"], reorder: r["reorder"], opening_qty: r["opening_qty"], cost: r["cost"], section: r["section"].presence)
        row.error = "name is required" if row.name.blank?
        row.error ||= "unknown unit #{row.unit}" unless units.include?(row.unit)
        row.error ||= "unknown purchase unit #{row.purchase_unit}" if row.purchase_unit && !units.include?(row.purchase_unit)
        %w[minimum reorder cost].each { |f| row.error ||= "#{f} must be a number" if row.public_send(f).present? && !row.public_send(f).to_s.strip.match?(/\A-?\d+(\.\d+)?\z/) }
        row.error ||= "opening quantity must be a number" if row.opening_qty.present? && !row.opening_qty.to_s.match?(/\A-?\d+(\.\d+)?\z/)
        rows << row
      end
      self
    end

    def preview
      { rows: rows.first(500).map(&:to_h), row_count: rows.size, valid_count: rows.count { |r| r.error.nil? }, error_rows: rows.select(&:error).map { |r| { line: r.line, name: r.name, error: r.error } } }
    end

    # Creates or updates items by SKU then name; opening quantities post as one adjustment document per section.
    def apply!(branch:, actor:)
      units = Unit.active.index_by(&:code)
      created = updated = 0
      openings = Hash.new { |h, k| h[k] = [] }
      StockItem.transaction do
        rows.reject(&:error).each do |r|
          item = (r.sku && StockItem.active.find_by(sku: r.sku)) || StockItem.active.find_by(name: r.name)
          attrs = { name: r.name, sku: r.sku, category: r.category, base_unit: units[r.unit], purchase_unit: r.purchase_unit && units[r.purchase_unit],
                    minimum_qty: r.minimum.presence || 0, reorder_qty: r.reorder.presence || 0 }
          if item
            item.update!(attrs.compact)
            updated += 1
          else
            item = StockItem.create!(attrs)
            created += 1
          end
          if r.opening_qty.present? && r.opening_qty.to_d != 0
            section = r.section ? (StockSection.active.where(branch_id: branch.id).find_by(name: r.section) || StockSection.create!(branch: branch, name: r.section)) : StockSection.default_for(branch)
            openings[section.id] << { stock_item_id: item.id, unit_id: item.base_unit_id, quantity: r.opening_qty, unit_cost_minor: r.cost.present? ? (r.cost.to_d * 100).round : nil }
          end
        end
        docs = openings.map do |section_id, lines|
          doc = Posting.create!({ kind: "adjustment", from_section_id: section_id, reason: "Opening stock import", note: "Imported #{Date.current}" }, lines: lines, actor: actor, branch: branch)
          Posting.post!(doc, actor: actor)
        end
        { created: created, updated: updated, skipped: rows.count(&:error), opening_documents: docs.map(&:label) }
      end
    end
  end
end

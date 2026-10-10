module Stock
  # Produces a sub-recipe in batches: consumes the ingredients from the source section and receives the output item at the batch cost.
  module Production
    module_function

    def run!(recipe:, quantity:, section:, actor:, branch:, note: nil)
      raise Api::Errors::Unprocessable.new("recipe.not_sub_recipe", "Only a sub-recipe can be produced") unless recipe.sub_recipe?
      raise Api::Errors::Unprocessable.new("recipe.no_lines", "Add ingredients to the recipe first") if recipe.lines.empty?
      quantity = BigDecimal(quantity.to_s)
      raise Api::Errors::Unprocessable.new("production.quantity", "Quantity must be positive") unless quantity.positive?
      settings = InventorySetting.current
      day = branch.business_day_for(Time.current)
      raise Api::Errors::Conflict.new("stock.day_locked", "Stock is locked up to #{settings.day_lock_date}") if settings.locked?(day)
      batches = quantity / recipe.yield_qty
      source = recipe.source_section || section
      StockDocument.transaction do
        doc = StockDocument.create!(branch: branch, number: DocumentCounter.next!("stock_document"), kind: "production", status: "draft", to_section_id: section.id, from_section_id: source.id,
                                    note: note || "Produced #{quantity.to_s('F')} #{recipe.yield_unit&.code || recipe.output_stock_item.base_unit.code} of #{recipe.name}", by_membership_id: actor&.id)
        consumed_minor = 0
        recipe.lines.includes(:stock_item).each do |l|
          qty = (l.gross_base_quantity * batches).round(3)
          r = Ledger.apply!(section: source, item: l.stock_item, kind: "production_out", quantity: -qty, actor: actor, ref: doc, business_day: day, allow_negative: settings.allow_manual_below_zero, reason: recipe.name)
          consumed_minor += r.entry.value_minor.abs
        end
        out_base = recipe.yield_unit ? recipe.yield_unit.convert(quantity, to: recipe.output_stock_item.base_unit) : quantity
        unit_cost = out_base.zero? ? 0 : BigDecimal(consumed_minor.to_s) / out_base
        doc.lines.create!(stock_item: recipe.output_stock_item, unit: recipe.yield_unit || recipe.output_stock_item.base_unit, quantity: quantity, unit_cost_minor: nil, note: "output")
        Ledger.apply!(section: section, item: recipe.output_stock_item, kind: "production_in", quantity: out_base, unit_cost: unit_cost, actor: actor, ref: doc, business_day: day, reason: recipe.name)
        doc.update!(status: "posted", posted_at: Time.current, posted_by_membership_id: actor&.id, business_day: day)
        batch = ProductionBatch.create!(branch: branch, recipe: recipe, stock_document: doc, stock_section: section, quantity_produced: quantity, cost_minor: consumed_minor, produced_at: Time.current, by_membership_id: actor&.id)
        Recipes::Costing.recompute_all!
        AuditLog.record(action: "production", record: batch, after: { recipe: recipe.name, quantity: quantity.to_s, cost_minor: consumed_minor, document: doc.label })
        batch
      end
    end
  end
end

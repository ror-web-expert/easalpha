module Stock
  # SPEC Reset Stock: zero every level of a section (or the branch) through a posted adjustment document, so the ledger
  # keeps the trail and nothing is deleted.
  module Reset
    module_function

    def call!(branch:, actor:, section: nil, reason: "Stock reset")
      sections = section ? [ section ] : StockSection.active.where(branch_id: branch.id).to_a
      docs = sections.filter_map do |s|
        levels = StockLevel.where(stock_section_id: s.id).where.not(quantity: 0).includes(stock_item: :base_unit)
        next if levels.empty?
        lines = levels.map { |l| { stock_item_id: l.stock_item_id, unit_id: l.stock_item.base_unit_id, quantity: -l.quantity } }
        doc = Posting.create!({ kind: "adjustment", from_section_id: s.id, reason: reason }, lines: lines, actor: actor, branch: branch)
        Posting.post!(doc, actor: actor, allow_negative: true)
        doc
      end
      AuditLog.record(action: "bulk_update", table_name: "stock_levels", after: { reset: true, sections: sections.map(&:name), documents: docs.map(&:label) })
      docs
    end
  end
end

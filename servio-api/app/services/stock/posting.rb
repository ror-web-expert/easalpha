module Stock
  # Posts and cancels numbered stock documents. Each line becomes one or two ledger rows.
  module Posting
    module_function

    def create!(attrs, lines:, actor:, branch:)
      if attrs[:client_id].present? && (existing = StockDocument.find_by(client_id: attrs[:client_id]))
        return existing
      end
      StockDocument.transaction do
        doc = StockDocument.new(attrs.merge(branch: branch, by_membership_id: actor&.id, status: "draft"))
        doc.number = DocumentCounter.next!("stock_document")
        doc.save!
        replace_lines!(doc, lines)
        doc
      end
    end

    def replace_lines!(doc, lines)
      raise Api::Errors::Conflict.new("stock.document_posted", "Only a draft can be edited") unless doc.draft?
      doc.lines.destroy_all
      Array(lines).each do |l|
        item = StockItem.active.find(l[:stock_item_id])
        unit = l[:unit_id].present? ? Unit.find(l[:unit_id]) : item.base_unit
        doc.lines.create!(stock_item: item, unit: unit, quantity: l[:quantity] || 0, unit_cost_minor: l[:unit_cost_minor], batch_no: l[:batch_no], expires_on: l[:expires_on],
                          counted_qty: l[:counted_qty], expected_qty: l[:expected_qty], note: l[:note])
      end
      doc.lines.reload
    end

    def post!(doc, actor:)
      raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.draft?
      raise Api::Errors::Conflict.new("stock.no_lines", "Add at least one line") if doc.lines.empty?
      settings = InventorySetting.current
      day = doc.branch.business_day_for(Time.current)
      raise Api::Errors::Conflict.new("stock.day_locked", "Stock is locked up to #{settings.day_lock_date}") if settings.locked?(day)
      raise Api::Errors::Conflict.new("stock.counting_closed", "Open counting in inventory settings before posting a count") if doc.kind == "count" && !settings.counting_open
      allow_negative = settings.allow_manual_below_zero
      StockDocument.transaction do
        doc.lines.includes(stock_item: :base_unit, unit: nil).each do |line|
          item, qty = line.stock_item, line.base_quantity
          case doc.kind
          when "receive"
            Ledger.apply!(section: doc.to_section, item: item, kind: "receive", quantity: qty, unit_cost: line.base_unit_cost, actor: actor, ref: doc, business_day: day)
          when "production"
            Ledger.apply!(section: doc.to_section, item: item, kind: "production_in", quantity: qty, unit_cost: line.base_unit_cost, actor: actor, ref: doc, business_day: day)
          when "transfer"
            Ledger.apply!(section: doc.from_section, item: item, kind: "transfer_out", quantity: -qty, actor: actor, ref: doc, business_day: day, allow_negative: allow_negative)
            Ledger.apply!(section: doc.to_section, item: item, kind: "transfer_in", quantity: qty, actor: actor, ref: doc, business_day: day)
          when "waste"
            Ledger.apply!(section: doc.from_section, item: item, kind: "waste", quantity: -qty.abs, actor: actor, ref: doc, business_day: day, reason: doc.reason, allow_negative: true)
          when "supplier_return"
            Ledger.apply!(section: doc.from_section, item: item, kind: "supplier_return", quantity: -qty.abs, actor: actor, ref: doc, business_day: day, allow_negative: allow_negative)
          when "adjustment"
            Ledger.apply!(section: doc.from_section, item: item, kind: "adjustment", quantity: qty, actor: actor, ref: doc, business_day: day, reason: doc.reason, unit_cost: qty.positive? ? line.base_unit_cost : nil,
                          allow_negative: allow_negative || qty.positive?)
          when "count"
            level = StockLevel.find_by(stock_section_id: doc.from_section_id, stock_item_id: item.id)
            expected = level&.quantity || 0
            line.update_columns(expected_qty: expected)
            delta = qty - expected
            Ledger.apply!(section: doc.from_section, item: item, kind: "count", quantity: delta, actor: actor, ref: doc, business_day: day, reason: "stock count", allow_negative: true) unless delta.zero?
          end
        end
        doc.update!(status: "posted", posted_at: Time.current, posted_by_membership_id: actor&.id, business_day: day)
        AuditLog.record(action: "stock_post", record: doc, after: { kind: doc.kind, number: doc.number, lines: doc.lines.size })
      end
      doc
    end

    # Cancelling a posted document inserts reversing ledger rows; a draft is simply marked cancelled.
    def cancel!(doc, actor:, reason: nil)
      raise Api::Errors::Conflict.new("stock.document_status", "Document is already cancelled") if doc.status == "cancelled"
      settings = InventorySetting.current
      raise Api::Errors::Conflict.new("stock.day_locked", "Stock is locked up to #{settings.day_lock_date}") if doc.posted? && settings.locked?(doc.business_day)
      StockDocument.transaction do
        if doc.posted?
          StockLedgerEntry.where(ref_table: "stock_documents", ref_id: doc.id, reversed_by_entry_id: nil, reverses_entry_id: nil).order(:created_at).each { |e| Ledger.reverse!(e, actor: actor, reason: reason || "cancelled #{doc.label}") }
        end
        doc.update!(status: "cancelled", cancelled_at: Time.current)
        AuditLog.record(action: "stock_cancel", record: doc, after: { reason: reason })
      end
      doc
    end
  end
end

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
        doc.number = DocumentCounter.next!("stock_#{doc.kind}") # SPEC: numbered per type, GRN-000023
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

    # SPEC: a chosen posting date (never on or before the day lock); awaiting_approval and in_transit documents post too.
    # Every step locks the document row first and checks its status under the lock, so two requests on one document (a
    # receive and a void of a transfer, or two receives) take turns and the second sees what the first did.
    def post!(doc, actor:, posting_date: nil, allow_negative: nil)
      StockDocument.transaction do
        doc.lock!
        raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.draft? || doc.awaiting_approval? || doc.in_transit?
        raise Api::Errors::Conflict.new("stock.no_lines", "Add at least one line") if doc.lines.empty?
        settings = InventorySetting.current
        today = doc.branch.business_day_for(Time.current)
        # A transfer in transit arrives on the day it is received: its dispatch day may have been locked since it left.
        day = (posting_date || (doc.in_transit? ? nil : doc.posting_date) || today).to_date
        raise Api::Errors::Conflict.new("stock.future_date", "The posting date cannot be after today") if day > today
        raise Api::Errors::Conflict.new("stock.before_dispatch", "A transfer cannot arrive before it left on #{doc.business_day}") if doc.in_transit? && doc.business_day && day < doc.business_day
        check_open!(doc, day, settings)
        raise Api::Errors::Conflict.new("stock.counting_closed", "Open counting in inventory settings before posting a count") if doc.kind == "count" && !settings.counting_open
        if doc.kind == "count" && (blank = doc.lines.find { |l| l.counted_qty.nil? })
          # A line without a figure would be read as nothing found and empty the shelf.
          raise Api::Errors::Unprocessable.new("stock.count_missing", "Enter the counted quantity for #{blank.stock_item.name} (0 if none is left)")
        end
        allow_negative = settings.allow_manual_below_zero if allow_negative.nil?
        next receive_transit!(doc, actor: actor, day: day) if doc.in_transit?
        doc.lines.includes(stock_item: :base_unit, unit: nil).each do |line|
          item, qty = line.stock_item, line.base_quantity
          case doc.kind
          when "receive", "po_receipt", "opening_balance"
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
            # The level row is locked so a sale cannot land between reading "expected" and writing the difference. A
            # count posted for an earlier day compares against the level as it stood at the end of that day, read from
            # the ledger (the level row only holds today's figure); the difference still lands on the level now.
            level = StockLevel.lock.find_or_create_by!(stock_section_id: doc.from_section_id, stock_item_id: item.id)
            refuse_earlier_count!(doc, item, day) if day < today
            expected = day < today ? on_hand_as_of(doc.from_section_id, item.id, day) : level.quantity
            line.update_columns(expected_qty: expected)
            delta = qty - expected
            Ledger.apply!(section: doc.from_section, item: item, kind: "count", quantity: delta, actor: actor, ref: doc, business_day: day, reason: "stock count", allow_negative: true) unless delta.zero?
          end
        end
        doc.update!(status: "posted", posted_at: Time.current, posted_by_membership_id: actor&.id, business_day: day, posting_date: day)
        if doc.kind.in?(%w[waste adjustment count opening_balance]) || (doc.kind == "receive" && doc.goods_receipt_id.nil?)
          Finance::Journal.stock_entries!(StockLedgerEntry.where(ref_table: "stock_documents", ref_id: doc.id), ref: doc, description: "#{doc.label} #{doc.kind.humanize.downcase}", business_day: day)
        end
        AuditLog.record(action: "stock_post", record: doc, after: { kind: doc.kind, number: doc.number, lines: doc.lines.size })
        doc
      end
    end

    # Stock moves only on an open day: not on or before the inventory lock, and not on a business day that was closed
    # (Shifts::DayCloser), the lock every money movement already honours.
    def check_open!(doc, day, settings = InventorySetting.current)
      raise Api::Errors::Conflict.new("stock.day_locked", "Stock is locked up to #{settings.day_lock_date}") if settings.locked?(day)
      raise Api::Errors::Conflict.new("day.locked", "#{day} is locked. A manager must reopen it first.") if DayClose.locked?(doc.branch_id, day)
    end

    # What the ledger says stood in a section at the end of a day. A voided document's rows and their reversals are left
    # out as a pair, wherever the reversal is dated: that movement never happened. A sale and a later return of it both
    # happened, so each counts on its own day.
    def on_hand_as_of(section_id, item_id, day)
      StockLedgerEntry.where(stock_section_id: section_id, stock_item_id: item_id).where("business_day <= ?", day)
                      .where("NOT (COALESCE(ref_table, '') = 'stock_documents' AND (reversed_by_entry_id IS NOT NULL OR reverses_entry_id IS NOT NULL))").sum(:quantity)
    end

    # A count for an earlier day than one already posted would correct the later count's figure a second time.
    def refuse_earlier_count!(doc, item, day)
      later = StockDocument.where(kind: "count", status: "posted", from_section_id: doc.from_section_id).where("business_day > ?", day).where.not(id: doc.id)
                           .where(id: StockDocumentLine.where(stock_item_id: item.id).select(:stock_document_id)).order(business_day: :desc).first
      return unless later
      raise Api::Errors::Conflict.new("stock.later_count", "#{item.name} was counted in #{doc.from_section.name} on #{later.business_day} (#{later.label}). Void that count first, or count for #{later.business_day} or later.")
    end

    # SPEC Awaiting approval: a document submitted by someone without posting rights waits for a manager.
    def submit!(doc, actor:)
      StockDocument.transaction do
        doc.lock!
        raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.draft?
        raise Api::Errors::Conflict.new("stock.no_lines", "Add at least one line") if doc.lines.empty?
        doc.update!(status: "awaiting_approval")
        doc
      end
    end

    def approve!(doc, actor:, posting_date: nil)
      StockDocument.transaction do
        doc.lock!
        raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.awaiting_approval?
        doc.update!(approved_by_membership_id: actor&.id)
        doc.kind == "transfer" ? dispatch!(doc, actor: actor, posting_date: posting_date) : post!(doc, actor: actor, posting_date: posting_date)
      end
    end

    # SPEC In transit: a transfer leaves the source now and lands in the destination when it is received.
    def dispatch!(doc, actor:, posting_date: nil)
      StockDocument.transaction do
        doc.lock!
        raise Api::Errors::Conflict.new("stock.not_transfer", "Only a transfer goes in transit") unless doc.kind == "transfer"
        raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.draft? || doc.awaiting_approval?
        settings = InventorySetting.current
        day = (posting_date || doc.posting_date || doc.branch.business_day_for(Time.current)).to_date
        check_open!(doc, day, settings)
        doc.lines.includes(:stock_item, :unit).each do |line|
          Ledger.apply!(section: doc.from_section, item: line.stock_item, kind: "transfer_out", quantity: -line.base_quantity, actor: actor, ref: doc, business_day: day, allow_negative: settings.allow_manual_below_zero)
        end
        doc.update!(status: "in_transit", dispatched_at: Time.current, business_day: day, posting_date: day)
        doc
      end
    end

    # Called by post! under the document's lock.
    def receive_transit!(doc, actor:, day:)
      doc.lines.includes(:stock_item, :unit).each do |line|
        Ledger.apply!(section: doc.to_section, item: line.stock_item, kind: "transfer_in", quantity: line.base_quantity, actor: actor, ref: doc, business_day: day)
      end
      doc.update!(status: "posted", received_at: Time.current, posted_at: Time.current, posted_by_membership_id: actor&.id)
      doc
    end

    # Cancelling a posted document inserts reversing ledger rows, dated today; a draft is simply marked cancelled. A
    # transfer in transit has already left its source (dispatch! wrote the transfer_out rows), so those come back too,
    # today, even when the day it left has been locked since. A posted document's own day must still be open.
    def cancel!(doc, actor:, reason: nil)
      StockDocument.transaction do
        doc.lock!
        raise Api::Errors::Conflict.new("stock.document_status", "Document is already voided") if doc.voided?
        settings = InventorySetting.current
        today = doc.branch.business_day_for(Time.current)
        revaluation = 0
        if doc.posted? || doc.in_transit?
          raise Api::Errors::Conflict.new("stock.day_locked", "Stock is locked up to #{settings.day_lock_date}") if doc.posted? && settings.locked?(doc.business_day)
          check_open!(doc, today, settings)
          entries = StockLedgerEntry.where(ref_table: "stock_documents", ref_id: doc.id, reversed_by_entry_id: nil, reverses_entry_id: nil).order(:created_at).to_a
          _rows, revaluation = Ledger.reverse_all!(entries, actor: actor, reason: reason || "voided #{doc.label}")
        end
        doc.update!(status: "voided", cancelled_at: Time.current) # SPEC: Voided
        Finance::Journal.reverse_for!(doc, actor: actor)
        revalue_journal!(doc, revaluation, day: today) unless revaluation.zero?
        AuditLog.record(action: "stock_cancel", record: doc, after: { reason: reason })
        doc
      end
    end

    # Taking a receipt out of the average changes what the stock still on hand is worth (review B12): the difference
    # goes to Inventory against Stock Revaluation, so the Inventory account keeps matching the stock valuation. Posted
    # after the document's own journal is reversed, so that reversal does not take it back.
    def revalue_journal!(doc, amount, day:)
      lines = amount.positive? ? [ { account: "1200", debit_minor: amount }, { account: "5210", credit_minor: amount } ] : [ { account: "5210", debit_minor: -amount }, { account: "1200", credit_minor: -amount } ]
      Finance::Journal.post!(business_day: day, lines: lines, description: "#{doc.label} voided: stock revalued at the new average cost", ref: doc, branch_id: doc.branch_id)
    end
  end
end

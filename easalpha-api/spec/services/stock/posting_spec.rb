require "rails_helper"

# Stock::Posting after the 6 Nov review: voiding a transfer in transit puts the dispatched stock back (item 9), and a
# count locks the level row and compares a backdated count against the level as it stood on that day. Final round:
# a backdated count leaves voided documents out (stock#0), a transfer whose dispatch day was locked still arrives or is
# voided today (stock#6), the document row is locked (stock#7), a closed business day takes no waste or count (B9), a
# count line needs its figure (B15), and a void that moves the average is booked against Inventory (B12, stock#3).
RSpec.describe Stock::Posting do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }

  # 100 boxes in the warehouse, received on the given day.
  def seed!(posting_date: nil)
    Unit.seed_defaults!
    kitchen, warehouse = StockSection.ensure_system!(branch)
    box = StockItem.create!(name: "Box", sku: "BOX", base_unit: Unit.find_by!(code: "pcs"))
    doc = described_class.create!({ kind: "receive", to_section_id: warehouse.id }, lines: [ { stock_item_id: box.id, quantity: 100, unit_cost_minor: 1_000 } ], actor: owner, branch: branch)
    described_class.post!(doc, actor: owner, posting_date: posting_date)
    { kitchen: kitchen, warehouse: warehouse, box: box }
  end

  def level(section, item) = StockLevel.find_by(stock_section_id: section.id, stock_item_id: item.id)&.quantity.to_d

  def dispatch!(s, quantity: 10, posting_date: nil)
    doc = described_class.create!({ kind: "transfer", from_section_id: s[:warehouse].id, to_section_id: s[:kitchen].id }, lines: [ { stock_item_id: s[:box].id, quantity: quantity } ], actor: owner, branch: branch)
    described_class.dispatch!(doc, actor: owner, posting_date: posting_date)
  end

  def count!(s, counted, day)
    doc = described_class.create!({ kind: "count", from_section_id: s[:warehouse].id }, lines: [ { stock_item_id: s[:box].id, counted_qty: counted } ], actor: owner, branch: branch)
    described_class.post!(doc, actor: owner, posting_date: day)
  end

  it "voiding a transfer in transit returns the dispatched stock to its source" do
    within(biz) do
      s = seed!
      doc = dispatch!(s)
      expect(doc.status).to eq("in_transit")
      expect(level(s[:warehouse], s[:box])).to eq(90)
      described_class.cancel!(doc, actor: owner, reason: "sent by mistake")
      expect(doc.reload.status).to eq("voided")
      expect(level(s[:warehouse], s[:box])).to eq(100)
      expect(level(s[:kitchen], s[:box])).to eq(0)
      rows = StockLedgerEntry.where(ref_table: "stock_documents", ref_id: doc.id)
      expect(rows.pluck(:quantity).map(&:to_i)).to contain_exactly(-10, 10)
      expect(rows.where(reversed_by_entry_id: nil, reverses_entry_id: nil)).to be_empty
    end
  end

  it "honours the day lock for a transfer in transit too" do
    within(biz) do
      s = seed!
      doc = dispatch!(s)
      InventorySetting.current.update!(day_lock_date: today_for(biz))
      expect { described_class.cancel!(doc, actor: owner, reason: "late") }.to raise_error(Api::Errors::Conflict, /locked/)
      expect(level(s[:warehouse], s[:box])).to eq(90)
      expect(doc.reload.status).to eq("in_transit")
    end
  end

  it "a backdated count compares against the level as it stood on that day, not today's" do
    within(biz) do
      today = today_for(biz)
      s = seed!(posting_date: today - 2)
      waste = described_class.create!({ kind: "waste", from_section_id: s[:warehouse].id, reason: "Crushed" }, lines: [ { stock_item_id: s[:box].id, quantity: 30 } ], actor: owner, branch: branch)
      described_class.post!(waste, actor: owner, posting_date: today)
      expect(level(s[:warehouse], s[:box])).to eq(70)
      InventorySetting.current.update!(counting_open: true)
      count = described_class.create!({ kind: "count", from_section_id: s[:warehouse].id }, lines: [ { stock_item_id: s[:box].id, counted_qty: 95 } ], actor: owner, branch: branch)
      described_class.post!(count, actor: owner, posting_date: today - 1)
      # Yesterday 100 were on hand (the waste came today), 95 were counted: the level moves by -5, to 65.
      expect(count.lines.first.reload.expected_qty).to eq(100)
      expect(StockLedgerEntry.find_by(ref_table: "stock_documents", ref_id: count.id).quantity).to eq(-5)
      expect(level(s[:warehouse], s[:box])).to eq(65)
    end
  end

  # stock#0: the reversal of a voided document is dated the day of the void, but the movement never happened.
  it "a backdated count leaves a voided count or receipt out, and refuses to go behind a later count" do
    within(biz) do
      today = today_for(biz)
      s = seed!(posting_date: today - 3)
      InventorySetting.current.update!(counting_open: true)
      typo = count!(s, 90, today - 1)
      expect(level(s[:warehouse], s[:box])).to eq(90)
      described_class.cancel!(typo, actor: owner, reason: "typed 90 for 95")
      expect(level(s[:warehouse], s[:box])).to eq(100)
      recount = count!(s, 95, today - 1)
      expect(recount.lines.first.reload.expected_qty).to eq(100)
      expect(level(s[:warehouse], s[:box])).to eq(95)

      wrong = described_class.create!({ kind: "receive", to_section_id: s[:warehouse].id }, lines: [ { stock_item_id: s[:box].id, quantity: 50, unit_cost_minor: 1_000 } ], actor: owner, branch: branch)
      described_class.post!(wrong, actor: owner, posting_date: today - 1)
      described_class.cancel!(wrong, actor: owner, reason: "not ours")
      expect(level(s[:warehouse], s[:box])).to eq(95)

      expect { count!(s, 90, today - 2) }.to raise_error(Api::Errors::Conflict, /counted in Warehouse on #{today - 1}/)
      expect(level(s[:warehouse], s[:box])).to eq(95)
      count!(s, 95, today - 1) # the same day again finds what the first count left
      expect(level(s[:warehouse], s[:box])).to eq(95)
    end
  end

  # stock#6: the boxes left two days ago and the manager locked stock up to yesterday while they were on the road.
  it "receives or voids a transfer into today when its dispatch day has been locked since" do
    within(biz) do
      today = today_for(biz)
      s = seed!(posting_date: today - 3)
      on_road = dispatch!(s, posting_date: today - 2)
      back = dispatch!(s, posting_date: today - 2)
      InventorySetting.current.update!(day_lock_date: today - 1)
      expect { described_class.post!(on_road, actor: owner, posting_date: today - 3) }.to raise_error(Api::Errors::Conflict)
      described_class.post!(on_road, actor: owner) # as the web sends it: no date
      expect(on_road.reload.status).to eq("posted")
      expect(StockLedgerEntry.find_by(ref_table: "stock_documents", ref_id: on_road.id, kind: "transfer_in").business_day).to eq(today)
      described_class.cancel!(back, actor: owner, reason: "not needed")
      expect(back.reload.status).to eq("voided")
      expect(StockLedgerEntry.find_by(ref_table: "stock_documents", ref_id: back.id, quantity: 10).business_day).to eq(today)
      expect([ level(s[:warehouse], s[:box]), level(s[:kitchen], s[:box]) ]).to eq([ 90, 10 ])
    end
  end

  # stock#7: two requests loaded the same document; the second one finds what the first did.
  it "locks the document, so a void and a receive in flight, or two receives, cannot both move stock" do
    within(biz) do
      s = seed!
      doc = dispatch!(s)
      seen_by_receiver = StockDocument.find(doc.id)
      described_class.cancel!(StockDocument.find(doc.id), actor: owner, reason: "sent by mistake")
      expect { described_class.post!(seen_by_receiver, actor: owner) }.to raise_error(Api::Errors::Conflict, /voided/)
      expect([ level(s[:warehouse], s[:box]), level(s[:kitchen], s[:box]) ]).to eq([ 100, 0 ])

      twice = dispatch!(s)
      first, second = StockDocument.find(twice.id), StockDocument.find(twice.id)
      described_class.post!(first, actor: owner)
      expect { described_class.post!(second, actor: owner) }.to raise_error(Api::Errors::Conflict, /posted/)
      expect([ level(s[:warehouse], s[:box]), level(s[:kitchen], s[:box]) ]).to eq([ 90, 10 ])
    end
  end

  # B9: the business day was closed; stock may not move on it any more than money can.
  it "refuses waste and counts on a closed business day" do
    within(biz) do
      today = today_for(biz)
      s = seed!(posting_date: today - 1)
      InventorySetting.current.update!(counting_open: true)
      DayClose.create!(branch_id: branch.id, business_day: today, locked_at: Time.current)
      waste = described_class.create!({ kind: "waste", from_section_id: s[:warehouse].id, reason: "Crushed" }, lines: [ { stock_item_id: s[:box].id, quantity: 5 } ], actor: owner, branch: branch)
      expect { described_class.post!(waste, actor: owner) }.to raise_error(Api::Errors::Conflict, /#{today} is locked/)
      expect { count!(s, 80, today) }.to raise_error(Api::Errors::Conflict, /locked/)
      expect(level(s[:warehouse], s[:box])).to eq(100)
      described_class.post!(waste, actor: owner, posting_date: today - 1) # yesterday is still open
      expect(level(s[:warehouse], s[:box])).to eq(95)
    end
  end

  # B15: a count line sent without counted_qty used to be read as zero found and emptied the shelf.
  it "refuses a count line without a counted quantity" do
    within(biz) do
      s = seed!
      InventorySetting.current.update!(counting_open: true)
      doc = described_class.create!({ kind: "count", from_section_id: s[:warehouse].id }, lines: [ { stock_item_id: s[:box].id, quantity: 45 } ], actor: owner, branch: branch)
      expect { described_class.post!(doc, actor: owner) }.to raise_error(Api::Errors::Unprocessable, /counted quantity for Box/)
      expect(level(s[:warehouse], s[:box])).to eq(100)
      expect(doc.reload.status).to eq("draft")
    end
  end

  # B12 and stock#3: a cancelled receipt comes out of the average once per item, and the change it makes to what the
  # stock left on hand is worth reaches the books, so Inventory keeps matching the valuation.
  it "books the revaluation of a void against Inventory and replays each item once" do
    within(biz) do
      s = seed!
      oil = StockItem.create!(name: "Oil", sku: "OIL", base_unit: Unit.find_by!(code: "pcs"))
      dear = described_class.create!({ kind: "receive", to_section_id: s[:warehouse].id },
                                     lines: [ { stock_item_id: s[:box].id, quantity: 60, unit_cost_minor: 3_000 }, { stock_item_id: s[:box].id, quantity: 40, unit_cost_minor: 3_000 },
                                              { stock_item_id: oil.id, quantity: 10, unit_cost_minor: 500 } ], actor: owner, branch: branch)
      described_class.post!(dear, actor: owner)
      expect(s[:box].reload.avg_cost_minor_per_base).to eq(2_000)
      waste = described_class.create!({ kind: "waste", from_section_id: s[:warehouse].id, reason: "Crushed" }, lines: [ { stock_item_id: s[:box].id, quantity: 50 } ], actor: owner, branch: branch)
      described_class.post!(waste, actor: owner)
      inventory = -> { Finance::Statements.balances(as_of: today_for(biz))[Finance::Chart.account("1200").id] }
      valuation = -> { Reports::Stock.value_of(StockLevel.all) }
      expect(inventory.call).to eq(valuation.call)

      expect(Stock::Ledger).to receive(:recompute_average!).twice.and_call_original
      described_class.cancel!(dear, actor: owner, reason: "wrong supplier")
      expect(s[:box].reload.avg_cost_minor_per_base).to eq(1_000)
      expect(valuation.call).to eq(50_000) # 50 boxes at 1,000; the oil is gone
      expect(inventory.call).to eq(50_000)
      entry = JournalEntry.find_by(ref_table: "stock_documents", ref_id: dear.id, description: "#{dear.label} voided: stock revalued at the new average cost")
      expect(entry.lines.map { |l| [ l.gl_account.code, l.debit_minor, l.credit_minor ] }).to contain_exactly([ "1200", 50_000, 0 ], [ "5210", 0, 50_000 ])
    end
  end
end

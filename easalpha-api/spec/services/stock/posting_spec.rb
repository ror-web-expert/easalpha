require "rails_helper"

# Stock::Posting after the 6 Nov review: voiding a transfer in transit puts the dispatched stock back (item 9), and a
# count locks the level row and compares a backdated count against the level as it stood on that day.
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

  def dispatch!(s, quantity: 10)
    doc = described_class.create!({ kind: "transfer", from_section_id: s[:warehouse].id, to_section_id: s[:kitchen].id }, lines: [ { stock_item_id: s[:box].id, quantity: quantity } ], actor: owner, branch: branch)
    described_class.dispatch!(doc, actor: owner)
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
end

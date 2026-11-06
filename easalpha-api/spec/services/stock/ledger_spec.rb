require "rails_helper"

# Stock::Ledger after the 6 Nov review: a cancelled receipt comes out of the average cost (replayed from the live
# entries), and every level is worth quantity times that one average.
RSpec.describe Stock::Ledger do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }

  it "recomputes the average when a receipt is cancelled and keeps every level at quantity times average" do
    within(biz) do
      Unit.seed_defaults!
      kitchen, warehouse = StockSection.ensure_system!(branch)
      item = StockItem.create!(name: "Bun", base_unit: Unit.find_by!(code: "pcs"))
      receive = lambda do |qty, cost|
        doc = Stock::Posting.create!({ kind: "receive", to_section_id: warehouse.id }, lines: [ { stock_item_id: item.id, quantity: qty, unit_cost_minor: cost } ], actor: owner, branch: branch)
        Stock::Posting.post!(doc, actor: owner)
      end
      receive.call(100, 1_000)
      wrong = receive.call(100, 3_000)
      expect(item.reload.avg_cost_minor_per_base).to eq(2_000)
      transfer = Stock::Posting.create!({ kind: "transfer", from_section_id: warehouse.id, to_section_id: kitchen.id }, lines: [ { stock_item_id: item.id, quantity: 50 } ], actor: owner, branch: branch)
      Stock::Posting.post!(transfer, actor: owner)
      expect(StockLevel.where(stock_item_id: item.id).sum(:value_minor)).to eq(400_000)

      Stock::Posting.cancel!(wrong, actor: owner, reason: "wrong price")
      expect(item.reload.avg_cost_minor_per_base).to eq(1_000)
      levels = StockLevel.where(stock_item_id: item.id)
      expect(levels.sum(:quantity)).to eq(100)
      levels.each { |l| expect(l.value_minor).to eq((l.quantity * 1_000).round) }
      expect(Reports::Stock.valuation.sum { |r| r[:value_minor] }).to eq(100_000)
      expect(Reports::Stock.levels[:total_value_minor]).to eq(100_000)
      expect(Reports::Stock.levels[:rows].first[:sections].sum { |x| x[:value_minor] }).to eq(100_000)
      expect(Reports::Stock.valuation_cogs(branch: branch, from: today_for(biz), to: today_for(biz))[:stock_value_minor]).to eq(100_000)
    end
  end
end

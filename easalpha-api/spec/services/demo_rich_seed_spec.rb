require "rails_helper"

RSpec.describe Demo::RichSeed do
  let!(:owner) { signup_business(name: "Seed Cafe") }
  let(:biz) { owner.business }

  before { build_menu!(biz) }

  it "seeds a short history through the services and is idempotent on a second run" do
    result = described_class.run!(business_slug: biz.slug, days: 3)
    expect(result.skipped).to be(false)
    counts = result.counts
    expect(counts[:orders]).to be >= 60
    expect(counts[:orders_by_status]).to include("paid", "closed")
    expect(counts[:voids] + counts[:refunds] + counts[:staff_meals]).to be >= 1
    expect(counts[:open_orders_today]).to be_between(5, 8)
    expect(counts[:customers]).to eq(40)
    expect(counts[:payments]).to be >= 50
    expect(counts[:payments_by_method].keys).to include("cash")
    expect(counts[:stock_items]).to eq(25)
    expect(counts[:low_stock_items]).to eq(3)
    expect(counts[:employees]).to eq(8)
    expect(counts[:attendance_rows]).to be > 50
    expect(counts[:payroll_runs]).to eq(1)
    expect(counts[:expenses]).to be >= 10
    expect(counts[:journal_entries]).to be > 50
    expect(counts[:reviews]).to eq(10)
    expect(counts[:riders]).to eq(2)
    expect(counts[:goods_receipts]).to be >= 1

    within(biz) do
      expect(Business.find(biz.id).settings[Demo::RichSeed::MARKER]).to be_present
      expect(Order.where(status: %w[paid closed]).where(stock_deducted_at: nil).count).to eq(0)
      expect(Shift.open.count).to eq(1)
      expect(StockLevel.where("quantity < 0").count).to eq(0)
    end

    again = described_class.run!(business_slug: biz.slug, days: 3)
    expect(again.skipped).to be(true)
    expect(again.counts[:orders]).to eq(counts[:orders])
    expect(again.counts[:customers]).to eq(counts[:customers])
    expect(again.counts[:expenses]).to eq(counts[:expenses])
  end
end

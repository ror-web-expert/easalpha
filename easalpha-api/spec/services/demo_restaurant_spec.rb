require "rails_helper"

RSpec.describe Demo::Restaurant do
  it "creates the demo restaurant with staff, a full menu, tables and devices, and is idempotent" do
    r = described_class.seed!(email: "demo@example.com", password: "password123")
    expect(r.created).to be(true)
    Tenancy::Context.with(r.business) do
      expect(Category.active.count).to eq(6)
      expect(Product.active.count).to be >= 20
      expect(Product.active.where.not(name_ur: nil).count).to eq(Product.active.count)
      expect(Product.active.find_by!(name: "Zinger Burger").variants.count).to eq(2)
      expect(ModifierGroup.active.pluck(:name)).to include("Spice level", "Extras")
      expect(Deal.active.count).to eq(2)
      expect(DiningTable.active.count).to eq(10)
      expect(Floor.active.count).to eq(2)
      expect(Device.where(kind: "till").first.pairing_code).to eq("123456")
      expect(Membership.joins(:role).where(roles: { system_key: %w[manager cashier] }).count).to eq(2)
    end
    again = described_class.seed!(email: "demo@example.com", password: "password123")
    expect(again.created).to be(false)
    Tenancy::Context.with(r.business) { expect(Product.active.count).to eq(Product.active.count) ; expect(Category.active.count).to eq(6) }
  end

  it "feeds the rich history seed" do
    r = described_class.seed!(email: "demo2@example.com", password: "password123")
    result = Demo::RichSeed.run!(business_slug: r.business.slug, days: 2)
    expect(result.skipped).to be(false)
    expect(result.counts[:orders]).to be > 30
    expect(result.counts[:recipes]).to be >= 10
  end
end

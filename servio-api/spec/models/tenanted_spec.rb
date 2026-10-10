require "rails_helper"

RSpec.describe Tenanted do
  it "raises when a tenant model is queried without a business context" do
    Current.reset
    Tenancy::Context.default_allow_unscoped = false
    expect { Branch.count }.to raise_error(Tenanted::NoTenantError)
  ensure
    Tenancy::Context.default_allow_unscoped = nil
  end

  it "scopes queries and assigns business_id inside a context" do
    a = signup_business(name: "A")
    b = signup_business(name: "B")
    Tenancy::Context.with(a.business) do
      expect(Branch.count).to eq(1)
      br = Branch.create!(name: "Second", code: "B2")
      expect(br.business_id).to eq(a.business_id)
      expect { Branch.create!(name: "Wrong", code: "B3", business_id: b.business_id) }.to raise_error(ActiveRecord::RecordInvalid)
    end
    Tenancy::Context.with(b.business) { expect(Branch.count).to eq(1) }
  end

  it "computes the business day from the branch day-end time" do
    a = signup_business(name: "A")
    Tenancy::Context.with(a.business) do
      br = Branch.first
      br.update!(day_end_time: "04:00", time_zone: "Asia/Karachi")
      expect(br.business_day_for(Time.find_zone("Asia/Karachi").parse("2026-10-08 01:30"))).to eq(Date.new(2026, 10, 7))
      expect(br.business_day_for(Time.find_zone("Asia/Karachi").parse("2026-10-08 04:00"))).to eq(Date.new(2026, 10, 8))
      expect(br.business_day_for(Time.find_zone("Asia/Karachi").parse("2026-10-08 23:59"))).to eq(Date.new(2026, 10, 8))
    end
  end
end

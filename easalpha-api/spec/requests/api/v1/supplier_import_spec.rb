require "rails_helper"

# The supplier CSV import is all or nothing (leftovers of 7 Nov 2026, L1 item 4). On a locked business day a new
# supplier's opening balance cannot reach the journal; the import stopped at that row with the rows above it already
# saved. Now it names the row and keeps nothing, and the same file imports in full once the day is open.
RSpec.describe "Supplier CSV import", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:day) { today_for(biz) }

  def h = auth_headers(owner)

  def import!(csv)
    api_post "/api/v1/suppliers/import", { csv: csv }, headers: h
  end

  let(:csv) { "name,contact,phone,terms,opening_balance\nFarm,Bilal,,7,\nDairy Co,Sana,,30,\"1,500.50\"\nMeat House,Asad,,15,0\n" }

  it "keeps none of the rows when one cannot be saved, and names that row" do
    within(biz) { Supplier.create!(name: "Farm", contact_name: "Ali") }
    api_post "/api/v1/day_close/lock", { business_day: day.to_s, force: true }, headers: h
    expect(response).to have_http_status(:ok), response.body

    import!(csv)
    expect(response).to have_http_status(:conflict)
    expect(json[:error]).to include(code: "day.locked", details: { row: 3, name: "Dairy Co" })
    expect(json[:error][:message]).to eq("Row 3 (Dairy Co): #{day} is locked. A manager must reopen it first. Nothing was imported.")
    within(biz) do
      expect(Supplier.pluck(:name)).to eq([ "Farm" ])
      expect(Supplier.find_by!(name: "Farm").contact_name).to eq("Ali") # the update above the row went back too
      expect(JournalEntry.count).to eq(0)
    end

    api_post "/api/v1/day_close/reopen", { business_day: day.to_s, reason: "Supplier import" }, headers: h
    expect(response).to have_http_status(:ok), response.body
    import!(csv)
    expect(response).to have_http_status(:ok), response.body
    expect(json).to eq(created: 2, updated: 1)
    within(biz) do
      expect(Supplier.order(:name).pluck(:name, :contact_name, :balance_minor)).to eq([ [ "Dairy Co", "Sana", 150_050 ], [ "Farm", "Bilal", 0 ], [ "Meat House", "Asad", 0 ] ])
    end
  end

  it "refuses an opening balance that is not a number, by its row, and keeps none of the rows" do
    import!("name,opening_balance\nFarm,250\nDairy Co,abc\n")
    expect(response).to have_http_status(:bad_request)
    expect(json[:error]).to include(code: "import.opening_balance", details: { row: 3, name: "Dairy Co" })
    expect(json[:error][:message]).to eq("Row 3 (Dairy Co): opening_balance abc is not a number. Nothing was imported.")
    expect(within(biz) { Supplier.count }).to eq(0)
  end
end

require "rails_helper"

# Transfers between branches (6 Nov review): the receiving branch lists a transfer addressed to it, and voiding one in
# transit returns the stock to its source.
RSpec.describe "Stock transfers between branches", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let(:main) { within(biz) { Branch.order(:created_at).first } }
  let(:other) { within(biz) { Branch.create!(name: "Second") } }

  it "shows an incoming transfer at the receiving branch and voids one in transit without losing stock" do
    item = warehouse = far = nil
    within(biz) do
      Unit.seed_defaults!
      warehouse = StockSection.ensure_system!(main).last
      far = StockSection.ensure_system!(other).first
      item = StockItem.create!(name: "Box", base_unit: Unit.find_by!(code: "pcs"))
      Stock::Posting.post!(Stock::Posting.create!({ kind: "receive", to_section_id: warehouse.id }, lines: [ { stock_item_id: item.id, quantity: 100, unit_cost_minor: 1_000 } ], actor: owner, branch: main), actor: owner)
    end
    api_post "/api/v1/stock_documents", { kind: "transfer", from_section_id: warehouse.id, to_section_id: far.id, lines: [ { stock_item_id: item.id, quantity: 10 } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    doc = json
    api_post "/api/v1/stock_documents/#{doc[:id]}/dispatch", {}, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("in_transit")

    get "/api/v1/stock_documents", headers: headers.merge("X-Branch-Id" => other.id)
    expect(response).to have_http_status(:ok), response.body
    expect(json[:data].map { |d| [ d[:id], d[:status] ] }).to eq([ [ doc[:id], "in_transit" ] ])
    get "/api/v1/stock_documents", headers: headers
    expect(json[:data].map { |d| d[:kind] }).to contain_exactly("receive", "transfer")

    api_post "/api/v1/stock_documents/#{doc[:id]}/cancel", { reason: "wrong branch" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json[:status]).to eq("voided")
    within(biz) do
      expect(StockLevel.find_by(stock_section_id: warehouse.id, stock_item_id: item.id).quantity).to eq(100)
      expect(StockLevel.find_by(stock_section_id: far.id, stock_item_id: item.id)&.quantity.to_d).to eq(0)
    end
  end
end

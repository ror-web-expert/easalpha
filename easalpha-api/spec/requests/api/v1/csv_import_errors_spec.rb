require "rails_helper"

# A file that is not valid CSV answered 500 from the customer, supplier and stock imports (leftovers of 7 Nov 2026,
# L1 item 8). Every importer reads through SafeCsv.parse, which now answers 400 import.csv with the line the parser
# stopped at; the menu import's preview keeps listing it among its parse errors, as it does a JSON file it cannot read.
RSpec.describe "Imports of a file that is not valid CSV", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }

  def h = auth_headers(owner)

  # A quote inside a field on the third line of the file.
  let(:broken) { "name,phone\nFarm,03001112233\nAli \"the\" Khan,03004445566\n" }

  def expect_csv_error
    expect(response).to have_http_status(:bad_request), response.body
    expect(json[:error]).to include(code: "import.csv", message: "The file could not be read as CSV: Illegal quoting in line 3.", details: { line: 3 })
  end

  it "answers 400 import.csv with the line from the customer, supplier and stock imports, and keeps nothing" do
    api_post "/api/v1/customers/import", { data: broken }, headers: h
    expect_csv_error
    api_post "/api/v1/suppliers/import", { csv: broken }, headers: h
    expect_csv_error
    api_post "/api/v1/stock_items/import/preview", { csv: broken }, headers: h
    expect_csv_error
    api_post "/api/v1/stock_items/import", { csv: broken }, headers: h
    expect_csv_error
    within(biz) { expect([ Customer.where(name: "Farm").count, Supplier.count, StockItem.count ]).to eq([ 0, 0, 0 ]) }
  end

  it "lists it among the menu import preview's parse errors" do
    api_post "/api/v1/menu/import/preview", { source: "csv", data: "category,name,price\nMains,Burger,450\nMains,Zinger \"XL\",650\n" }, headers: h
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(row_count: 0, parse_errors: [ "The file could not be read as CSV: Illegal quoting in line 3." ])
  end

  it "still reads a good file" do
    api_post "/api/v1/suppliers/import", { csv: "name,phone\nFarm,03001112233\n" }, headers: h
    expect(response).to have_http_status(:ok), response.body
    expect(json).to eq(created: 1, updated: 0)
  end
end

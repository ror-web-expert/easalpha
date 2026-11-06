require "rails_helper"

# QA of 6 Nov 2026, P5: the Items and Demand pages filter by GET /stock_items/categories, which took stock.actions, so a
# stock clerk who may look at stock got both pages with a failing filter. It is read like the items now.
RSpec.describe "Reads the admin pages need", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }

  it "lets a member who may look at stock read the item categories, and keeps writing items for stock.actions" do
    role = within(biz) { Role.create!(name: "Stock clerk", is_system: false).tap { |r| r.set_permissions!("app.admin" => nil, "stock.view" => nil, "stock.count" => nil) } }
    clerk = within(biz) { Membership.create!(user: create(:user), role: role, status: "active") }
    within(biz) do
      Unit.seed_defaults!
      StockItem.create!(name: "Flour", sku: "FLR", category: "Dry goods", base_unit: Unit.find_by!(code: "pcs"))
    end
    get "/api/v1/stock_items/categories", headers: auth_headers(clerk)
    expect(response).to have_http_status(:ok)
    expect(json[:data]).to eq([ "Dry goods" ])
    api_post "/api/v1/stock_items", { name: "Sugar", sku: "SGR" }, headers: auth_headers(clerk)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/stock_items/categories", headers: auth_headers(add_member!(biz, "waiter"))
    expect(response).to have_http_status(:forbidden)
  end
end

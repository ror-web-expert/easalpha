require "rails_helper"

RSpec.describe "Exports", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:headers) { auth_headers(owner) }

  it "exports menu, orders and customers as CSV and logs the export" do
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: 9_280 } ] }, headers: headers
    get "/api/v1/exports/menu.csv", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.content_type).to include("text/csv")
    expect(response.body.lines.size).to eq(3)
    expect(response.body).to include("Zinger Burger,")
    get "/api/v1/exports/orders.csv", headers: headers
    expect(response.body.lines.size).to eq(2)
    expect(response.body).to include("walk_in,till,paid,paid")
    get "/api/v1/exports/customers.csv", headers: headers
    expect(response.body).to include("Walk-in customer")
    get "/api/v1/exports/nothing.csv", headers: headers
    expect(response).to have_http_status(:not_found)
    get "/api/v1/audit_logs?action_name=export", headers: headers
    expect(json[:data].size).to eq(3)
    cashier = add_member!(biz, "cashier")
    get "/api/v1/exports/orders.csv", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end
end

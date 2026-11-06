require "rails_helper"

# S6 (6 Nov 2026): the Branding page saves the receipt header, footer and paper as pos.receipt.* settings, but the
# server receipt read the old businesses.settings["receipt"] hash, so the header and footer never printed and 58 mm
# paper came back as 80.
RSpec.describe "Receipt branding", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }
  let!(:m) { build_menu!(biz) }

  def paid_receipt
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:chai].id } ], place: true }, headers: headers
    id = json[:id]
    api_post "/api/v1/orders/#{id}/payments", { payments: [ { method_code: "cash", amount_minor: json[:total_minor] } ] }, headers: headers
    expect(response).to have_http_status(:created), response.body
    get "/api/v1/orders/#{id}/receipt", headers: headers
    json
  end

  it "prints the header, footer, paper and language the Branding page saved" do
    api_patch "/api/v1/settings", { values: { "pos.receipt.header" => "Halal food since 1998", "pos.receipt.footer" => "Come again", "pos.receipt.paper" => "58", "pos.receipt.language" => "ur" } }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(paid_receipt).to include(header: "Halal food since 1998", footer: "Come again", paper: "58", language: "ur")
  end

  it "uses the defaults for a new business, the old receipt hash where one was kept, and a branch's own row first" do
    expect(paid_receipt).to include(header: nil, footer: "Thank you", paper: "80", language: "en")
    within(biz) { biz.update!(settings: biz.settings.merge("receipt" => { "header" => "From the old screen", "paper" => "58" })) }
    expect(paid_receipt).to include(header: "From the old screen", footer: "Thank you", paper: "58")
    within(biz) do
      Setting.write!(biz, { "pos.receipt.footer" => "Business footer" })
      Setting.write!(biz, { "pos.receipt.footer" => "Branch footer" }, branch: m[:branch])
    end
    expect(paid_receipt).to include(footer: "Branch footer")
  end
end

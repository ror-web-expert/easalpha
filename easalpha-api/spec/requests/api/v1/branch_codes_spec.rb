require "rails_helper"

# Review of 6 Nov 2026, R15: a branch code is part of every receipt number and its barcode. New and changed codes are
# 1 to 8 of A-Z and 0-9 (upper-cased as given); a code saved before the rule is left alone and keeps working.
RSpec.describe "Branch codes", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  def create_branch(code) = api_post("/api/v1/branches", { name: "Branch #{code}", code: code, time_zone: "Asia/Karachi" }, headers: headers)

  it "takes 1 to 8 letters and digits, upper-casing them, and refuses a space, a symbol, a non-ASCII letter or a ninth character" do
    create_branch(" dha2 ")
    expect(response).to have_http_status(:created), response.body
    expect(json[:code]).to eq("DHA2")
    create_branch("GULBERG1")
    expect(response).to have_http_status(:created)
    [ "DHA 2", "B-3", "B_3", "ÖST", "GULBERG12", "" ].each do |bad|
      create_branch(bad)
      expect(response).to have_http_status(:unprocessable_content), "#{bad.inspect} was accepted"
      expect(json[:error][:message]).to include("Code must be 1 to 8 letters A-Z or digits") unless bad.empty?
    end
  end

  it "leaves an older odd code alone on an update that does not change it, and holds a changed code to the rule" do
    branch = within(biz) { Branch.first.tap { |b| b.update_columns(code: "DHA 2") } }
    api_patch "/api/v1/branches/#{branch.id}", { name: "DHA Phase 2", code: "DHA 2" }, headers: headers
    expect(response).to have_http_status(:ok), response.body
    expect(json).to include(name: "DHA Phase 2", code: "DHA 2")
    api_patch "/api/v1/branches/#{branch.id}", { code: "DHA 3" }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    api_patch "/api/v1/branches/#{branch.id}", { code: "dha3" }, headers: headers
    expect(json[:code]).to eq("DHA3")
  end

  it "keeps numbering receipts for a branch with an older odd code" do
    m = build_menu!(biz)
    within(biz) { Branch.first.update_columns(code: "DHA 2") }
    api_post "/api/v1/orders", { order_type: "takeaway", place: true, lines: [ { product_id: m[:chai].id } ] }, headers: headers
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }, headers: headers
    number = within(biz) { Order.find(o[:id]).receipt_number }
    expect(number).to match(/\A\d{6}-DHA 2-\d+\z/)
    get "/api/v1/orders", params: { q: number }, headers: headers
    expect(json[:data].map { |r| r[:id] }).to eq([ o[:id] ])
  end
end

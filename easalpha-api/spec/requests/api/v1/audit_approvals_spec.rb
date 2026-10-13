require "rails_helper"

# Audit rows hold the approving manager as a user, which is what the audit screen looks names up by. A membership id
# there matched no one, so the approver showed blank, and audit rows can never be corrected afterwards.
RSpec.describe "Manager approvals in the audit log", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:cashier) { add_member!(biz, "cashier") }
  let!(:manager) { add_member!(biz, "manager", pin: "4321") }
  let(:ch) { auth_headers(cashier) }

  def approvers(table) = AuditLog.where(business_id: biz.id, table_name: table).where.not(approved_by_user_id: nil).pluck(:approved_by_user_id)

  def approver_names(table)
    get "/api/v1/audit_logs", params: { table_name: table }, headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    json[:data].filter_map { |r| r[:approved_by_name] }.uniq
  end

  it "names the manager who approved a khata adjustment and its reversal" do
    c = within(biz) { Customer.create!(name: "Ali Raza") }
    api_post "/api/v1/customers/#{c.id}/adjustments", { kind: "adjustment", amount_minor: 5_000, reason: "Biscuits not entered", approver_pin: "4321" }, headers: ch
    expect(response).to have_http_status(:created), response.body
    api_post "/api/v1/customer_adjustments/#{json[:adjustment][:id]}/reverse", { reason: "Entered twice", approver_pin: "4321" }, headers: ch
    expect(response).to have_http_status(:created), response.body

    expect(approvers("customer_adjustments")).to eq([ manager.user_id, manager.user_id ])
    expect(approver_names("customer_adjustments")).to eq([ manager.user.name ])
  end

  it "names the manager who approved a barcode attached at the till" do
    m = build_menu!(biz)
    api_post "/api/v1/products/#{m[:chai].id}/barcodes", { code: "6291041500213", approver_pin: "4321" }, headers: ch
    expect(response).to have_http_status(:created), response.body
    expect(approvers("products")).to eq([ manager.user_id ])
    expect(approver_names("products")).to eq([ manager.user.name ])
  end
end

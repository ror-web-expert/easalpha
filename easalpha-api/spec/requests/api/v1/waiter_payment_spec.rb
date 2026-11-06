require "rails_helper"

# Final round, item 13 (the till's roles QA of 6 Nov 2026): a waiter takes orders but not payments. The till asks a
# manager's PIN before anything is saved and sends it, with approval_codes ["payments.take"], on the save and on the
# payment; the payment answered "Missing permission: payments.take" all the same.
RSpec.describe "A waiter's payment with a manager's PIN", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }
  let(:waiter) { add_member!(biz, "waiter", pin: "2222") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(waiter, app: "pos", device: device) }
  let(:pin) { { approver_pin: "9999", approval_codes: [ "payments.take" ] } }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  it "names payments.take without the PIN, takes the payment with it, and records who approved it" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }.merge(pin), headers: pos # the save, as the till sends it
    expect(response).to have_http_status(:created), response.body
    o = json
    pay = { payments: [ { method_code: "cash", amount_minor: o[:total_minor], tendered_minor: o[:total_minor] } ] }

    api_post "/api/v1/orders/#{o[:id]}/payments", pay, headers: pos
    expect(response).to have_http_status(:forbidden)
    expect(json[:error]).to include(code: "approval.required", details: { permissions: [ "payments.take" ], labels: { "payments.take": "Take payment" } })
    api_post "/api/v1/orders/#{o[:id]}/payments", pay.merge(approver_pin: "9999", approval_codes: [ "orders.void" ]), headers: pos
    expect(json[:error][:code]).to eq("approval.required") # the dialog did not show the manager this payment
    within(biz) { expect(Payment.where(order_id: o[:id])).to be_empty }

    api_post "/api/v1/orders/#{o[:id]}/payments", pay.merge(pin), headers: pos
    expect(response).to have_http_status(:created), response.body
    expect(json[:order]).to include(status: "paid", payment_status: "paid")
    within(biz) do
      expect(Payment.find_by!(order_id: o[:id]).received_by_membership_id).to eq(waiter.id)
      expect(AuditLog.where(record_id: o[:id], action: "approve", approved_by_user_id: manager.user_id)).to exist
    end
  end

  it "still refuses a role that takes no orders, PIN or not" do
    kitchen = add_member!(biz, "kitchen", pin: "3333")
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: auth_headers(owner)
    o = json
    api_post "/api/v1/orders/#{o[:id]}/payments", { payments: [ { method_code: "cash", amount_minor: o[:total_minor] } ] }.merge(pin), headers: auth_headers(kitchen)
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("permission.denied")
  end
end

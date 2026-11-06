require "rails_helper"

# Leftovers of 7 Nov 2026 (L3, item 10). Orders::Transitions.void! locks the order now (L1), so a queued void that
# read the order just before another void of it landed (another till, the admin, the same till online) found it
# voided under the lock and was refused order.status: the till listed it on its Attention page and flagged the order
# Rejected, though the order is voided as the record asked. It is answered as the duplicate it is, as a void replayed
# twice always was.
RSpec.describe "Sync push: a void that loses the race to another void", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T8") } }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(manager, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def push(record)
    api_post "/api/v1/sync/push", { records: [ record ] }, headers: pos
    expect(response).to have_http_status(:ok), response.body
    json[:results].first
  end

  it "answers it as a duplicate, with one void on the order and nothing to attend to" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: auth_headers(owner)
    order_id = json[:id]
    record = { type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: order_id, reason: "Wrong order" } }
    # The other void commits after the replay has read the order and before its own void takes the lock.
    raced = false
    allow(Orders::Transitions).to receive(:void!).and_wrap_original do |original, order, **opts|
      unless raced
        raced = true
        original.call(Order.find(order.id), reason: "Voided at the counter", actor: owner, approver: nil)
      end
      original.call(order, **opts)
    end
    expect(push(record)).to include(status: "duplicate")
    expect(push(record)).to include(status: "duplicate") # sent again: the same answer
    within(biz) do
      expect(Order.find(order_id).status).to eq("voided")
      expect(Void.where(order_id: order_id).pluck(:reason)).to eq([ "Voided at the counter" ])
      expect(SyncRejection.open.count).to eq(0)
    end
  end

  it "still refuses a void the lock finds refused for another reason" do
    api_post "/api/v1/orders", { order_type: "takeaway", lines: [ { product_id: m[:chai].id } ], place: true }, headers: auth_headers(owner)
    order_id = json[:id]
    within(biz) { DayClose.create!(branch_id: Branch.first.id, business_day: Order.find(order_id).business_day, locked_at: Time.current) }
    result = push({ type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: order_id, reason: "Wrong order" } })
    expect(result).to include(status: "rejected", code: "day.locked")
  end
end

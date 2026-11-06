require "rails_helper"

# Review of 6 Nov 2026, A9: a revoked device or a deactivated member keeps no live stream, and a subscriber hears only
# a branch the device sits at or the member may work at.
RSpec.describe ApplicationCable::Connection, type: :channel do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T8") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  it "connects a paired device and refuses it once revoked" do
    connect "/cable", params: { token: Auth::TokenService.device_token(device) }
    expect(connection.principal).to include(business_id: biz.id, device_id: device.id, branch_ids: [ device.branch_id ])
    device.update!(revoked_at: Time.current)
    expect { connect "/cable", params: { token: Auth::TokenService.device_token(device) } }.to have_rejected_connection
  end

  it "connects an active member and refuses one who was deactivated, or whose till was removed" do
    token = Auth::TokenService.access_token(user: cashier.user, membership: cashier, app: "pos", device: device)
    connect "/cable", params: { token: token }
    expect(connection.principal).to include(membership_id: cashier.id, device_id: device.id, branch_ids: "all")
    device.update!(revoked_at: Time.current)
    expect { connect "/cable", params: { token: token } }.to have_rejected_connection
    plain = Auth::TokenService.access_token(user: cashier.user, membership: cashier, app: "admin")
    connect "/cable", params: { token: plain }
    within(biz) { cashier.deactivate! }
    expect { connect "/cable", params: { token: plain } }.to have_rejected_connection
    expect { connect "/cable", params: { token: "not-a-token" } }.to have_rejected_connection
  end
end

RSpec.describe OrdersChannel, type: :channel do
  it "streams only a branch the subscriber is allowed on" do
    stub_connection principal: { business_id: "biz-1", branch_id: "branch-1", branch_ids: [ "branch-1" ] }
    subscribe
    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from("orders:biz-1:branch-1")
    subscribe(branch_id: "branch-2")
    expect(subscription).to be_rejected
    stub_connection principal: { business_id: "biz-1", branch_id: "branch-1", branch_ids: "all" }
    subscribe(branch_id: "branch-2")
    expect(subscription).to have_stream_from("orders:biz-1:branch-2")
  end
end

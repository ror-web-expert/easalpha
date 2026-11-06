require "rails_helper"

# Review of 6 Nov 2026, A9: a revoked device or a deactivated member keeps no live stream, and a subscriber hears only
# a branch the device sits at or the member may work at. Final round, sync-auth#9: access is asked again when a channel
# is subscribed and every minute after, and each kind of screen hears only the streams it needs.
RSpec.describe ApplicationCable::Connection, type: :channel do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T8") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  it "connects a paired device and refuses it once revoked" do
    connect "/cable", params: { token: Auth::TokenService.device_token(device) }
    expect(connection.principal).to include(business_id: biz.id, device_id: device.id, device_kind: "till", branch_ids: [ device.branch_id ])
    device.update!(revoked_at: Time.current)
    expect { connect "/cable", params: { token: Auth::TokenService.device_token(device) } }.to have_rejected_connection
  end

  it "connects an active member and refuses one who was deactivated, or whose till was removed" do
    token = Auth::TokenService.access_token(user: cashier.user, membership: cashier, app: "pos", device: device)
    connect "/cable", params: { token: token }
    expect(connection.principal).to include(membership_id: cashier.id, device_id: device.id, branch_ids: "all")
    expect(connection.principal).not_to have_key(:permissions) # looked up again by the channels, not kept in the identifier
    expect(ApplicationCable::Connection.resolve(typ: "access", business_id: biz.id, membership_id: cashier.id, device_id: device.id)[:permissions]).to include("orders.create")
    device.update!(revoked_at: Time.current)
    expect { connect "/cable", params: { token: token } }.to have_rejected_connection
    plain = Auth::TokenService.access_token(user: cashier.user, membership: cashier, app: "admin")
    connect "/cable", params: { token: plain }
    within(biz) { cashier.deactivate! }
    expect { connect "/cable", params: { token: plain } }.to have_rejected_connection
    expect { connect "/cable", params: { token: "not-a-token" } }.to have_rejected_connection
  end
end

RSpec.describe "Cable channels", type: :channel do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:branch) { within(biz) { Branch.first } }
  let(:other_branch) { within(biz) { Branch.create!(name: "DHA", code: "B2") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:rider) { add_member!(biz, "rider", pin: "2222") }

  def paired(kind, at: branch) = within(biz) { Device.create!(branch: at, name: kind, kind: kind, paired_at: Time.current) }
  # As the connection keeps them: the identifier without the permissions, which the channels look up again.
  def device_principal(device) = ApplicationCable::Connection.resolve(typ: "device", business_id: biz.id, device_id: device.id, branch_id: device.branch_id, app: "pos")&.except(:permissions)
  def session_principal(member, device: nil, app: "pos")
    token = Auth::TokenService.decode(Auth::TokenService.access_token(user: member.user, membership: member, app: app, device: device, branch: device&.branch))
    ApplicationCable::Connection.resolve(typ: "access", business_id: biz.id, device_id: token[:did], membership_id: member.id, branch_id: token[:brid], app: app).except(:permissions)
  end

  # A subscription to any channel on the stub connection, as the channel test case's subscribe makes one.
  def subscription_to(channel, principal, **params)
    stub_connection principal: principal
    connection.define_singleton_method(:close) { |**opts| (@closes ||= []) << opts }
    sub = channel.new(connection, "{}", params.with_indifferent_access)
    sub.singleton_class.include(ActionCable::Channel::ChannelStub)
    sub.subscribe_to_channel
    sub
  end

  def hears?(channel, principal, **params)
    sub = subscription_to(channel, principal, **params)
    !!sub.confirmed? && !sub.rejected?
  end

  describe OrdersChannel do
    it "streams to a session that takes orders, at the till or in the admin, and only on a branch it may work at" do
      till = paired("till")
      stub_connection principal: session_principal(cashier, device: till)
      subscribe
      expect(subscription).to be_confirmed
      expect(subscription).to have_stream_from("orders:#{biz.id}:#{branch.id}")
      within(biz) { cashier.update!(all_branches: false, branch_ids: [ branch.id ]) }
      stub_connection principal: session_principal(cashier.reload, device: till)
      subscribe(branch_id: other_branch.id)
      expect(subscription).to be_rejected
      stub_connection principal: session_principal(owner, app: "admin")
      subscribe(branch_id: other_branch.id)
      expect(subscription).to have_stream_from("orders:#{biz.id}:#{other_branch.id}")
    end

    it "is not for a device token alone, a kitchen, token or customer screen, a rider's phone or a kiosk" do
      expect(%w[till tablet kitchen token_screen customer_display rider kiosk].map { |k| hears?(OrdersChannel, device_principal(paired(k))) }).to all(be false)
      expect(hears?(OrdersChannel, session_principal(cashier, device: paired("kitchen"), app: "kitchen"))).to be false
      expect(hears?(OrdersChannel, session_principal(rider, device: paired("rider"), app: "rider"))).to be false
    end
  end

  describe KitchenChannel do
    it "streams to a kitchen screen and to a session with the kitchen display's permissions, not to a till's token alone" do
      expect(hears?(KitchenChannel, device_principal(paired("kitchen")))).to be true
      expect(hears?(KitchenChannel, session_principal(cashier, device: paired("till")))).to be true
      expect(%w[till tablet token_screen rider kiosk customer_display].map { |k| hears?(KitchenChannel, device_principal(paired(k))) }).to all(be false)
      expect(hears?(KitchenChannel, session_principal(rider, device: paired("rider"), app: "rider"))).to be false
    end
  end

  describe TokensChannel do
    it "streams to token and kitchen screens, a till or tablet's customer window, and kitchen sessions; not to riders or kiosks" do
      expect(%w[token_screen kitchen till tablet].map { |k| hears?(TokensChannel, device_principal(paired(k))) }).to all(be true)
      expect(%w[rider kiosk customer_display].map { |k| hears?(TokensChannel, device_principal(paired(k))) }).to all(be false)
      expect(hears?(TokensChannel, session_principal(cashier, device: paired("till")))).to be true
    end
  end

  describe "asking again" do
    def closes = connection.instance_variable_get(:@closes) || []

    def subscribed_as(principal, channel = KitchenChannel)
      sub = subscription_to(channel, principal)
      expect(sub).to be_confirmed
      sub
    end

    it "stops a kitchen screen removed in Admin, and refuses its next subscription on the same socket" do
      kitchen = paired("kitchen")
      principal = device_principal(kitchen)
      subscription = subscribed_as(principal)
      subscription.send(:recheck_access)
      expect(subscription.streams).to eq([ "kitchen:#{biz.id}:#{branch.id}" ])
      expect(closes).to eq([])
      kitchen.update!(revoked_at: Time.current)
      subscription.send(:recheck_access)
      expect(subscription.streams).to eq([])
      expect(closes).to eq([ { reason: "unauthorized", reconnect: false } ])
      expect(hears?(KitchenChannel, principal)).to be false
    end

    it "stops a member who was deactivated, or moved off the branch, on the orders stream" do
      till = paired("till")
      subscription = subscribed_as(session_principal(cashier, device: till), OrdersChannel)
      within(biz) { cashier.update!(all_branches: false, branch_ids: [ other_branch.id ]) }
      subscription.send(:recheck_access)
      expect(subscription.streams).to eq([])
      expect(closes.size).to eq(1)

      waiter = add_member!(biz, "waiter", pin: "3333")
      subscription = subscribed_as(session_principal(waiter, device: till), OrdersChannel)
      within(biz) { waiter.deactivate! }
      subscription.send(:recheck_access)
      expect(subscription.streams).to eq([])
    end
  end
end

require "rails_helper"

# Leftovers of 7 Nov 2026 (L3): a refusal a manager resolved on the admin's Needs attention stayed on the till's
# Attention page, which knew only what its own pushes and Dismiss did. The till now asks about the refusals it still
# lists (POST /sync/rejections/check) and drops the ones the server has resolved.
RSpec.describe "Sync: the till asks which of its refusals were resolved", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T1") } }
  let(:waiter) { add_member!(biz, "waiter", pin: "3333") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:as_waiter) { auth_headers(waiter, app: "pos", device: device) }
  let(:admin) { auth_headers(owner) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def push(records, headers: as_waiter) = api_post("/api/v1/sync/push", { records: records }, headers: headers)

  # A void a waiter queued: refused as approval.required until a manager's PIN comes with it.
  def refused_void!
    order_id = SecureRandom.uuid
    push([ { type: "order", id: order_id, membership_id: waiter.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ])
    void = { type: "void", id: SecureRandom.uuid, membership_id: waiter.id, payload: { order_id: order_id, reason: "Wrong order" } }
    push([ void ])
    expect(json[:results].first).to include(status: "rejected", code: "approval.required")
    void
  end

  def open_row(record) = within(biz) { SyncRejection.open.find_by!(record_id: record[:id]) }
  def resolve_in_admin(record, resolution) = api_post("/api/v1/sync/rejections/#{open_row(record).id}/resolve", { resolution: resolution }, headers: admin)

  def check(records, headers: as_waiter)
    api_post "/api/v1/sync/rejections/check", { records: records.map { |r| { type: r[:type], id: r[:id] } } }, headers: headers
    json
  end

  it "answers the refusals a manager dismissed or marked fixed in the admin, not those still open or refused again since" do
    dismissed, fixed, open, again = Array.new(4) { refused_void! }
    resolve_in_admin(dismissed, "dismissed")
    resolve_in_admin(fixed, "fixed")
    resolve_in_admin(again, "fixed")
    push([ again ]) # sent again from the till afterwards, and refused again: open once more
    resolved = check([ dismissed, fixed, open, again ])[:resolved]
    expect(response).to have_http_status(:ok)
    expect(resolved.map { |r| [ r[:type], r[:id], r[:resolution] ] }).to contain_exactly([ "void", dismissed[:id], "dismissed" ], [ "void", fixed[:id], "fixed" ])
    expect(resolved.map { |r| r[:resolved_at] }).to all(be_present)
  end

  it "answers a record that went through since, and only to the till that sent it" do
    void = refused_void!
    push([ void.merge(approver_pin: "9999") ])
    expect(json[:results].first[:status]).to eq("accepted")
    expect(check([ void ])[:resolved]).to contain_exactly(include(type: "void", id: void[:id], resolution: "accepted"))
    expect(check([ void.merge(type: "payment") ])[:resolved]).to be_empty # the record's type is part of it
    till2 = within(biz) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current, code: "T2") }
    expect(check([ void ], headers: auth_headers(waiter, app: "pos", device: till2))[:resolved]).to be_empty
  end

  it "is asked by a paired till, signed in or locked, about at most 200 records" do
    void = refused_void!
    resolve_in_admin(void, "dismissed")
    expect(check([ void ], headers: device_headers(device))[:resolved].size).to eq(1) # locked: the device token alone
    kds = within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current) }
    check([ void ], headers: device_headers(kds))
    expect(response).to have_http_status(:forbidden)
    check([ void ], headers: admin) # the admin panel is no till
    expect(response).to have_http_status(:forbidden)
    expect(check([ { type: "void", id: "not-a-uuid" } ])[:resolved]).to eq([])
    check(Array.new(201) { { type: "void", id: SecureRandom.uuid } })
    expect(response).to have_http_status(:bad_request)
  end
end

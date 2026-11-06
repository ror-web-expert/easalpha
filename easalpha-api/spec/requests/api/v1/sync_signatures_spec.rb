require "rails_helper"

# Final round of 6 Nov 2026 (P5), sync-auth#0 and #4: any till session could push records as a manager or the owner
# who had used that till in the last 60 days, with their permissions and no PIN. Now a PIN sign-in gets a sync key
# (pin_login and every refresh), the till signs each record it queues with the key of the session that made it, and
# the push takes a record naming another member only with that member's signature from this till, from a session
# still running when the record was made. Unsigned records from an older till build are taken under the old rule
# until Sync::Signature::SUNSET, and logged.
RSpec.describe "Sync push: signed records", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T1") } }
  let(:till2) { within(biz) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current, code: "T2") } }
  let!(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def pin_login(pin, on: device)
    api_post "/api/v1/devices/pin_login", { pin: pin }, headers: device_headers(on)
    expect(response).to have_http_status(:ok), response.body
    json
  end

  def chai_order(id: SecureRandom.uuid, by: manager, **payload)
    { type: "order", id: id, membership_id: by.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] }.merge(payload) }
  end

  # What the till does (src/lib/sync-sign.ts): the exact JSON it sends as signed, an HMAC-SHA256 of it under the
  # 32 bytes of sync_key, base64url. Made here with OpenSSL, not with the server's own helper.
  def signed(record, session, body: nil)
    body ||= record.slice(:type, :id, :membership_id, :payload).to_json
    key = Base64.urlsafe_decode64(session[:sync_key])
    { signed: body, signed_by: session[:sync_key_id], sig: Base64.urlsafe_encode64(OpenSSL::HMAC.digest("SHA256", key, body), padding: false) }
  end

  def push(records, headers: pos) = api_post("/api/v1/sync/push", { records: records }, headers: headers)
  def result = json[:results].first

  describe "the sync key" do
    it "comes with a POS PIN sign-in, from the session's first refresh token, and stays the same on every refresh" do
      s = pin_login("9999")
      first = RefreshToken.find_by!(token_digest: RefreshToken.digest(s[:refresh_token]))
      expect(s[:sync_key_id]).to eq(first.id)
      expect(s[:sync_key]).to eq(Sync::Signature.key_for(first.id))
      expect(Base64.urlsafe_decode64(s[:sync_key]).bytesize).to eq(32)

      api_post "/api/v1/auth/refresh", { refresh_token: s[:refresh_token] }
      r = json
      expect(r).to include(sync_key: s[:sync_key], sync_key_id: first.id)
      expect(RefreshToken.find_by!(token_digest: RefreshToken.digest(r[:refresh_token])).session_root_id).to eq(first.id)
      api_post "/api/v1/auth/refresh", { refresh_token: r[:refresh_token] }
      expect(json).to include(sync_key: s[:sync_key], sync_key_id: first.id)
      expect(RefreshToken.session_of(first.id).count).to eq(3)
    end

    it "is not given to an admin login or a kitchen display" do
      api_post "/api/v1/auth/login", { email: owner.user.email, password: "password123" }
      expect(response).to have_http_status(:ok)
      expect(json.keys).not_to include(:sync_key, :sync_key_id)
      kitchen = within(biz) { Device.create!(branch: Branch.first, name: "Kitchen", kind: "kitchen", paired_at: Time.current, code: "K1") }
      add_member!(biz, "kitchen", pin: "4444")
      s = pin_login("4444", on: kitchen)
      expect(s[:app]).to eq("kitchen")
      expect(s.keys).not_to include(:sync_key, :sync_key_id)
    end
  end

  describe "a record naming another member" do
    it "is that member's when they signed it in on this till: the manager's void goes through from the cashier's push, with no PIN" do
      s = pin_login("9999")
      order_id = SecureRandom.uuid
      push([ signed(chai_order(id: order_id), s) ])
      expect(result[:status]).to eq("accepted"), response.body
      void = { type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: order_id, reason: "wrong table", client_created_at: Time.current.iso8601 } }
      push([ signed(void, s) ])
      expect(result[:status]).to eq("accepted"), response.body
      within(biz) do
        expect(Order.find(order_id)).to have_attributes(taken_by_membership_id: manager.id, status: "voided")
        expect(Void.where(order_id: order_id).sole).to have_attributes(by_membership_id: manager.id, approved_by_membership_id: nil)
        expect(SyncRejection.count).to eq(0)
      end
    end

    it "is refused with a forged or wrong-key signature, a signature over other bytes, or one from another member's key" do
      s = pin_login("9999")
      mine = pin_login("1111")
      rec = chai_order
      wrong_key = signed(rec, s.merge(sync_key: Base64.urlsafe_encode64(SecureRandom.bytes(32), padding: false)))
      edited = signed(rec, s).merge(signed: rec.deep_merge(payload: { lines: [ { product_id: m[:chai].id, quantity: 1, price_override_minor: 100 } ] }).slice(:type, :id, :membership_id, :payload).to_json)
      cashiers_key = signed(rec, mine) # the cashier's own key, naming the manager
      unknown = signed(rec, s).merge(signed_by: SecureRandom.uuid)
      push([ wrong_key, edited, cashiers_key, unknown, signed(rec, s).merge(signed_by: "not-an-id") ])
      expect(json[:results].map { |r| r[:code] }).to eq(%w[actor.signature] * 5), response.body
      within(biz) do
        expect(Order.count).to eq(0)
        expect(SyncRejection.sole.payload.keys).to include("signed_by")
        expect(SyncRejection.sole.payload.keys).not_to include("sig")
      end
    end

    it "is refused when the signature comes from the member's sign-in on another till" do
      elsewhere = pin_login("9999", on: till2)
      push([ signed(chai_order, elsewhere) ])
      expect(result).to include(status: "rejected", code: "actor.signature")
    end

    it "is taken from a session revoked since when it was made before, and refused when made after or with no time" do
      s = pin_login("9999")
      api_post "/api/v1/auth/refresh", { refresh_token: s[:refresh_token] } # a rotation keeps the session going
      made_before = chai_order(client_created_at: Time.current.iso8601)
      void_order = SecureRandom.uuid
      push([ signed(chai_order(id: void_order), s) ])
      expect(result[:status]).to eq("accepted"), response.body
      travel 1.minute
      within(biz) { RefreshToken.session_of(s[:sync_key_id]).valid.sole.revoke! } # signed out, as Admin > Sessions does
      travel 10.minutes
      no_time = { type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: void_order, reason: "x" } }
      push([ signed(made_before, s), signed(chai_order(client_created_at: Time.current.iso8601), s), signed(no_time, s) ])
      expect(json[:results].map { |r| r[:status] }).to eq(%w[accepted rejected rejected]), response.body
      expect(json[:results].drop(1).map { |r| r[:code] }).to eq(%w[actor.session_ended actor.session_ended])
      expect(within(biz) { Order.find(made_before[:id]).taken_by_membership_id }).to eq(manager.id)
    end

    it "from a member deactivated since: what they signed before counts, nothing dated after, and a record with no time is judged as it arrives" do
      s = pin_login("9999")
      order_id = SecureRandom.uuid
      push([ signed(chai_order(id: order_id), s) ])
      travel 1.hour
      within(biz) { manager.deactivate! }
      travel 10.minutes # past the five minutes a till clock may run ahead
      before_it = chai_order(client_created_at: 30.minutes.ago.iso8601)
      after_it = chai_order(client_created_at: 30.minutes.from_now.iso8601)
      no_time = { type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: order_id, reason: "x" } }
      push([ signed(before_it, s), signed(after_it, s), signed(no_time, s) ], headers: auth_headers(cashier, app: "pos", device: device))
      expect(json[:results].map { |r| r[:code] || r[:status] }).to eq(%w[accepted actor.session_ended actor.session_ended]), response.body
      expect(within(biz) { Order.find(before_it[:id]).taken_by_membership_id }).to eq(manager.id)
      # Weeks later a made-up old time is held to the week the clock window allows, long after the deactivation.
      travel 40.days
      push([ signed(chai_order(client_created_at: "2000-01-01T00:00:00Z"), s) ], headers: auth_headers(cashier, app: "pos", device: device))
      expect(result).to include(status: "rejected", code: "actor.session_ended")
    end

    it "keeps approver_pin and approval_codes beside the signed bytes, and a signed record that is not JSON is refused" do
      mine = pin_login("1111")
      order_id = SecureRandom.uuid
      push([ signed(chai_order(id: order_id, by: cashier), mine) ])
      void = { type: "void", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: order_id, reason: "mistake", client_created_at: Time.current.iso8601 } }
      push([ signed(void, mine) ])
      expect(result).to include(status: "rejected", code: "approval.required")
      push([ signed(void, mine).merge(approver_pin: "9999", approval_codes: [ "orders.void" ]) ])
      expect(result[:status]).to eq("accepted"), response.body
      expect(within(biz) { Void.where(order_id: order_id).sole.approved_by_membership_id }).to eq(manager.id)
      push([ { signed: "{not json", signed_by: mine[:sync_key_id], sig: "x" } ])
      expect(result).to include(status: "rejected", code: "sync.signed")
    end

    it "is the pushing session's own record whatever its signature says, as before" do
      mine = pin_login("1111")
      id = SecureRandom.uuid
      push([ signed(chai_order(id: id, by: cashier), mine).merge(sig: "AAAA") ])
      expect(result[:status]).to eq("accepted"), response.body
      expect(within(biz) { Order.find(id).taken_by_membership_id }).to eq(cashier.id)
    end
  end

  describe "an unsigned record naming another member (a till build from before the signatures)" do
    # The manager signed in on this till (a refresh token for that member and device); the cashier pushes a void
    # naming the manager, with no signature and no PIN: the original sync-auth#0 exploit.
    def legacy_void
      order_id = SecureRandom.uuid
      push([ chai_order(id: order_id, by: cashier) ])
      expect(result[:status]).to eq("accepted"), response.body
      { type: "void", id: SecureRandom.uuid, membership_id: manager.id, payload: { order_id: order_id, reason: "wrong table" } }
    end

    it "is taken under the old rule before the sunset, and logged [sync.unsigned]" do
      travel_to(Sync::Signature::SUNSET - 1.day) do
        within(biz) { RefreshToken.issue!(user: manager.user, membership: manager, device: device, app: "pos") }
        void = legacy_void
        allow(Rails.logger).to receive(:warn).and_call_original
        push([ void ])
        expect(result[:status]).to eq("accepted"), response.body
        expect(Rails.logger).to have_received(:warn).with(a_string_including("[sync.unsigned]", "void #{void[:id]}", manager.id))
        expect(within(biz) { Order.find(void[:payload][:order_id]).status }).to eq("voided")
      end
    end

    it "never touches a kiosk's meal claim, which names nobody and has no session to sign with: its device pushes it after the sunset too" do
      kiosk = within(biz) { Device.create!(branch: Branch.first, name: "Kiosk", kind: "kiosk", paired_at: Time.current, code: "K1") }
      travel_to(Sync::Signature::SUNSET + 1.day) do
        push([ { type: "meal_claim", id: SecureRandom.uuid, payload: { fingerprint_id: "FP-404", client_created_at: Time.current.iso8601 } } ], headers: device_headers(kiosk))
        expect(response).to have_http_status(:ok), response.body
        expect(result).to include(status: "rejected", code: "canteen.unknown_worker") # judged by the canteen, not as actor.unsigned
      end
    end

    it "is refused as actor.unsigned from the sunset on, while the cashier's own unsigned records still go through" do
      travel_to(Sync::Signature::SUNSET + 1.day) do
        within(biz) { RefreshToken.issue!(user: manager.user, membership: manager, device: device, app: "pos") }
        void = legacy_void
        push([ void ])
        expect(result).to include(status: "rejected", code: "actor.unsigned")
        expect(within(biz) { Order.find(void[:payload][:order_id]).status }).to eq("placed")
      end
    end
  end

  # K7: server-side refusals were never resolved. Each Try again added an open row, an accepted retry left them all
  # open in the admin's Needs attention, and the till's Dismiss resolved nothing.
  describe "refusals" do
    let(:waiter) { add_member!(biz, "waiter", pin: "3333") }
    let(:as_waiter) { auth_headers(waiter, app: "pos", device: device) }

    def waiter_void
      order_id = SecureRandom.uuid
      push([ chai_order(id: order_id, by: waiter) ], headers: as_waiter)
      { type: "void", id: SecureRandom.uuid, membership_id: waiter.id, payload: { order_id: order_id, reason: "x" } }
    end

    it "keeps one open row for a record refused again, and resolves it when the record goes through" do
      void = waiter_void
      2.times { push([ void ], headers: as_waiter) }
      expect(result).to include(status: "rejected", code: "approval.required")
      within(biz) do
        row = SyncRejection.sole
        expect(row).to have_attributes(record_type: "void", record_id: void[:id], resolved_at: nil, sync_batch_id: SyncBatch.order(:started_at).last.id)
      end
      push([ void.merge(approver_pin: "9999") ], headers: as_waiter)
      expect(result[:status]).to eq("accepted"), response.body
      within(biz) { expect(SyncRejection.sole).to have_attributes(resolution: "accepted", resolved_by_membership_id: waiter.id, resolved_at: be_present) }
      get "/api/v1/sync/rejections", headers: auth_headers(owner)
      expect(json[:data]).to be_empty
      get "/api/v1/sync/rejections", params: { include_resolved: "true" }, headers: auth_headers(owner)
      expect(json[:data].map { |r| r[:resolution] }).to eq([ "accepted" ])
    end

    # The till's Attention page lists every record for OFFLINE_ORDERS (or settings.manage), and to anyone else the
    # records they made (QA K8): the server resolves the same.
    it "is resolved by the till's Dismiss, by the record's id: this till's only, anyone's for the whole list's permission, one's own otherwise" do
      void = waiter_void
      second = waiter_void
      push([ void, second ], headers: as_waiter)
      other = within(biz) { SyncRejection.create!(branch_id: Branch.first.id, device_id: till2.id, record_type: "void", record_id: void[:id], code: "x", message: "elsewhere") }
      dismiss = ->(record, member) { api_post "/api/v1/sync/rejections/#{record[:id]}/resolve", { resolution: "dismissed" }, headers: auth_headers(member, app: "pos", device: device) }
      api_post "/api/v1/sync/rejections/#{void[:id]}/resolve", { resolution: "dismissed" }, headers: device_headers(device)
      expect(response).to have_http_status(:unauthorized) # a locked till names nobody
      dismiss.call(void, cashier) # not hers, and she sees only her own
      expect(response).to have_http_status(:no_content)
      expect(within(biz) { SyncRejection.open.where(device_id: device.id).count }).to eq(2)
      dismiss.call(void, waiter) # his own
      dismiss.call(second, manager) # anyone's
      expect(response).to have_http_status(:no_content)
      within(biz) do
        expect(SyncRejection.where(device_id: device.id).pluck(:resolution, :resolved_by_membership_id)).to contain_exactly([ "dismissed", waiter.id ], [ "dismissed", manager.id ])
        expect(other.reload.resolved_at).to be_nil
      end
      dismiss.call(void, manager)
      expect(response).to have_http_status(:no_content) # nothing left open: the till may send it again
    end

    it "updates the open row a push running alongside wrote first, instead of failing on the one-open-row index" do
      void = waiter_void
      push([ void ], headers: as_waiter)
      row = within(biz) { SyncRejection.sole }
      allow(SyncRejection).to receive(:transaction).and_raise(ActiveRecord::RecordNotUnique) # the other push's insert won
      push([ void ], headers: as_waiter)
      expect(result).to include(status: "rejected", code: "approval.required")
      within(biz) { expect(SyncRejection.sole).to have_attributes(id: row.id, sync_batch_id: SyncBatch.order(:started_at).last.id) }
    end

    it "keeps a record whose id is not a UUID, without failing the push" do
      push([ { type: "order", id: "not-a-uuid", membership_id: cashier.id, payload: {} }, chai_order(by: cashier) ])
      expect(json[:results].map { |r| r[:status] }).to eq(%w[rejected accepted]), response.body
      expect(result[:code]).to eq("sync.id")
      within(biz) { expect(SyncRejection.sole.payload["id"]).to eq("not-a-uuid") }
    end
  end
end

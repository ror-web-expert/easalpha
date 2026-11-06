require "rails_helper"

# Review of 6 Nov 2026, item 1 (A1 to A6): a till's offline queue is pushed by a signed-in cashier, names only staff who
# signed in on that till, carries a manager PIN (never kept) for what needs approval, takes khata receipts and
# staff-meal completions, and keeps its clock within a week back and an hour ahead.
RSpec.describe "Sync push: session, actor, approvals, khata, completion, clock", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:admin) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T3") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:waiter) { add_member!(biz, "waiter", pin: "3333") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") } # exists before any PIN is tried
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  # A chai (Rs 80 plus 16% tax), placed on the till; payload keys override the defaults.
  def chai_order(id: SecureRandom.uuid, by: cashier, **payload)
    { type: "order", id: id, membership_id: by.id, payload: { order_type: "takeaway", status: "placed", lines: [ { product_id: m[:chai].id, quantity: 1 } ] }.merge(payload) }
  end

  def push(records, headers: pos) = api_post("/api/v1/sync/push", { records: records }, headers: headers)
  def first_result = json[:results].first
  def signed_in!(member, on: device) = within(biz) { RefreshToken.issue!(user: member.user, membership: member, device: on, app: "pos"); RefreshToken.where(membership_id: member.id).order(:created_at).last }

  describe "A1: who may push" do
    it "refuses the device token alone with session.required, while the downloads stay open to it" do
      push([ chai_order ], headers: device_headers(device))
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("session.required")
      expect(within(biz) { Order.count }).to eq(0)
      get "/api/v1/sync/changes", headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      get "/api/v1/sync/customers", headers: device_headers(device)
      expect(response).to have_http_status(:ok)
      push([ chai_order ])
      expect(first_result[:status]).to eq("accepted"), response.body
    end

    it "lets a kiosk push meal claims by itself and nothing else" do
      kiosk = within(biz) { Device.create!(branch: Branch.first, name: "Kiosk", kind: "kiosk", paired_at: Time.current, code: "K9") }
      push([ chai_order ], headers: device_headers(kiosk))
      expect(json[:error][:code]).to eq("session.required")
      push([ { type: "meal_claim", id: SecureRandom.uuid, payload: { fingerprint_id: "FP-404" } } ], headers: device_headers(kiosk))
      expect(response).to have_http_status(:ok) # through the gate; the canteen judges the claim itself
      expect(first_result).to include(status: "rejected", code: "canteen.unknown_worker")
    end
  end

  describe "A2: who made the record" do
    let(:other) { add_member!(biz, "cashier", pin: "2222") }

    it "takes a record from another member only if they signed in on this till within 60 days" do
      push([ chai_order(by: other) ])
      expect(first_result).to include(status: "rejected", code: "actor.unknown")
      token = signed_in!(other)
      id = SecureRandom.uuid
      push([ chai_order(id: id, by: other) ])
      expect(first_result[:status]).to eq("accepted"), response.body
      expect(within(biz) { Order.find(id).taken_by_membership_id }).to eq(other.id)
      token.update_columns(created_at: 61.days.ago)
      push([ chai_order(by: other) ])
      expect(first_result).to include(status: "rejected", code: "actor.unknown")
    end

    it "ignores a sign-in on another till; a revoked token on this one still says they were here" do
      other_till = within(biz) { Device.create!(branch: Branch.first, name: "Till 2", kind: "till", paired_at: Time.current, code: "T4") }
      signed_in!(other, on: other_till)
      push([ chai_order(by: other) ])
      expect(first_result).to include(status: "rejected", code: "actor.unknown")
      signed_in!(other).revoke!
      push([ chai_order(by: other) ])
      expect(first_result[:status]).to eq("accepted"), response.body
    end

    it "keeps a deactivated member's records from before the deactivation and refuses later ones" do
      signed_in!(other)
      within(biz) { other.deactivate! }
      push([ chai_order(by: other, client_created_at: 2.minutes.ago.iso8601) ])
      expect(first_result[:status]).to eq("accepted"), response.body
      push([ chai_order(by: other, client_created_at: 1.minute.from_now.iso8601) ])
      expect(first_result).to include(status: "rejected", code: "actor.unknown")
    end
  end

  describe "A3: approvals at replay" do
    it "takes a manager PIN on the record for every guarded step of it, and never keeps the PIN" do
      id = SecureRandom.uuid
      rec = chai_order(id: id, is_staff_meal: true, staff_meal_reason: "lunch", lines: [ { product_id: m[:chai].id, quantity: 1, price_override_minor: 5_000 } ])
      push([ rec ])
      expect(first_result).to include(status: "rejected", code: "approval.required")
      push([ rec.merge(approver_pin: "0000") ])
      expect(first_result).to include(status: "rejected", code: "approval.required")
      push([ rec.merge(approver_pin: "9999") ])
      expect(first_result[:status]).to eq("accepted"), response.body
      within(biz) do
        o = Order.find(id)
        expect(o.staff_meal_approved_by_id).to eq(manager.id)
        expect(o.items.first).to have_attributes(price_overridden: true, unit_price_minor: 5_000, override_approved_by_id: manager.id)
        kept = SyncRejection.pluck(:payload).to_json
        expect(kept).not_to include("approver_pin", "9999", "0000")
      end
    end

    it "no longer believes a named approver in the payload: a void needs the PIN" do
      id = SecureRandom.uuid
      push([ chai_order(id: id) ])
      v = { type: "void", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: id, reason: "mistake", approved_by_membership_id: manager.id } }
      push([ v ])
      expect(first_result).to include(status: "rejected", code: "approval.required")
      push([ v.merge(approver_pin: "9999") ])
      expect(first_result[:status]).to eq("accepted"), response.body
      within(biz) do
        expect(Order.find(id).status).to eq("voided")
        expect(Void.where(order_id: id).sole.approved_by_membership_id).to eq(manager.id)
      end
    end
  end

  describe "A4: customer payments taken offline" do
    let(:customer) { within(biz) { Customer.create!(name: "Sadia Akhtar", khata_no: 32, phone: "+923001807130", balance_minor: 50_000) } }

    def receipt(id: SecureRandom.uuid, by: cashier, **payload)
      { type: "customer_payment", id: id, membership_id: by.id,
        payload: { customer_id: customer.id, amount_minor: 20_000, method_code: "cash", reference: "KH-1", direction: "received", client_created_at: 10.minutes.ago.iso8601 }.merge(payload) }
    end

    it "records it once against the cashier's open shift; the same id again is a duplicate" do
      shift = within(biz) { Shifts::Manager.open!(cashier: cashier, branch: Branch.first, device: device, opening_cash_minor: 0) }
      id = SecureRandom.uuid
      push([ receipt(id: id) ])
      expect(first_result[:status]).to eq("accepted"), response.body
      within(biz) do
        expect(CustomerPayment.find(id)).to have_attributes(amount_minor: 20_000, direction: "received", shift_id: shift.id, collected_by_membership_id: cashier.id, reference: "KH-1")
        expect(customer.reload.balance_minor).to eq(30_000)
      end
      push([ receipt(id: id) ])
      expect(first_result[:status]).to eq("duplicate")
      within(biz) do
        expect(CustomerPayment.count).to eq(1)
        expect(customer.reload.balance_minor).to eq(30_000)
      end
    end

    it "needs khata.collect or a manager PIN, the module on, and an open day" do
      as_waiter = auth_headers(waiter, app: "pos", device: device)
      push([ receipt(by: waiter) ], headers: as_waiter)
      expect(first_result).to include(status: "rejected", code: "approval.required")
      id = SecureRandom.uuid
      push([ receipt(id: id, by: waiter).merge(approver_pin: "9999") ], headers: as_waiter)
      expect(first_result[:status]).to eq("accepted"), response.body
      within(biz) { expect(AuditLog.where(action: "approve", record_id: id).sole.approved_by_user_id).to eq(manager.user_id) }

      set_modules!(biz, customer_accounts: false)
      push([ receipt ])
      expect(first_result).to include(status: "rejected", code: "module.disabled")
      set_modules!(biz, customer_accounts: true)

      within(biz) { DayClose.create!(branch_id: branch.id, business_day: today_for(biz), locked_at: Time.current) }
      push([ receipt ])
      expect(first_result).to include(status: "rejected", code: "day.locked")
      expect(within(biz) { CustomerPayment.count }).to eq(1)
    end
  end

  describe "A5: completing offline" do
    let(:staff_meal) { { is_staff_meal: true, staff_meal_reason: "lunch" } }

    it "closes a staff meal taken offline without a payment" do
      id = SecureRandom.uuid
      push([ chai_order(id: id, complete: true, **staff_meal).merge(approver_pin: "9999") ])
      expect(first_result[:status]).to eq("accepted"), response.body
      within(biz) do
        o = Order.find(id)
        expect(o).to have_attributes(status: "closed", payment_status: "paid", total_minor: 0, completed_by_membership_id: cashier.id)
        expect(o.serial).to be_present
        expect(Payment.where(order_id: id)).to be_empty
      end
    end

    it "closes a staff meal already on the server when the till sends it again with complete" do
      id = SecureRandom.uuid
      push([ chai_order(id: id, **staff_meal).merge(approver_pin: "9999") ])
      expect(within(biz) { Order.find(id).status }).to eq("placed")
      push([ chai_order(id: id, complete: true, **staff_meal) ])
      expect(first_result[:status]).to eq("accepted"), response.body
      expect(within(biz) { Order.find(id).status }).to eq("closed")
      push([ chai_order(id: id, complete: true, **staff_meal) ])
      expect(first_result[:status]).to eq("duplicate")
    end

    it "closes a staff meal when the till sends complete on a queued update of an order the server already holds" do
      id = SecureRandom.uuid
      push([ chai_order(id: id, **staff_meal).merge(approver_pin: "9999") ])
      expect(within(biz) { Order.find(id).status }).to eq("placed")
      push([ { type: "order_update", id: id, membership_id: cashier.id, payload: { complete: true, lines: [ { product_id: m[:chai].id, quantity: 1 } ] } } ])
      expect(first_result[:status]).to eq("accepted"), response.body
      expect(within(biz) { Order.find(id) }).to have_attributes(status: "closed", payment_status: "paid", total_minor: 0)
    end

    it "does not close an unpaid order that is not a staff meal" do
      id = SecureRandom.uuid
      push([ chai_order(id: id, status: "completed") ])
      expect(first_result).to include(status: "rejected", code: "order.unpaid")
      expect(within(biz) { Order.find(id).status }).to eq("placed")
    end
  end

  describe "A6: the till's clock" do
    it "keeps a time within a week back and an hour ahead, moves the rest to the edge and logs the move" do
      old, future, fine = SecureRandom.uuid, SecureRandom.uuid, SecureRandom.uuid
      push([ chai_order(id: old, client_created_at: 10.days.ago.iso8601), chai_order(id: future, client_created_at: 2.days.from_now.iso8601), chai_order(id: fine, client_created_at: 3.days.ago.iso8601) ])
      expect(json[:results].map { |r| r[:status] }).to eq(%w[accepted accepted accepted]), response.body
      within(biz) do
        o = Order.find(old)
        expect(o.client_created_at).to be_within(1.minute).of(7.days.ago)
        expect(o.business_day).to eq(branch.business_day_for(7.days.ago))
        expect(AuditLog.where(action: "client_time_clamped", record_id: old).sole.after["client_created_at"]).to eq(o.client_created_at.iso8601)
        expect(Order.find(future).client_created_at).to be_within(1.minute).of(1.hour.from_now)
        expect(AuditLog.where(action: "client_time_clamped", record_id: future).count).to eq(1)
        expect(Order.find(fine).client_created_at).to be_within(1.minute).of(3.days.ago)
        expect(AuditLog.where(action: "client_time_clamped", record_id: fine).count).to eq(0)
      end
      push([ chai_order(client_created_at: "yesterday") ])
      expect(first_result).to include(status: "rejected", code: "order.client_time")
    end

    it "applies the same window online and checks the day lock after clamping" do
      id = SecureRandom.uuid
      api_post "/api/v1/orders", { id: id, order_type: "takeaway", client_created_at: 30.days.ago.iso8601, lines: [ { product_id: m[:chai].id } ], place: true }, headers: admin
      expect(response).to have_http_status(:created), response.body
      within(biz) do
        expect(Order.find(id).client_created_at).to be_within(1.minute).of(7.days.ago)
        expect(AuditLog.where(action: "client_time_clamped", record_id: id).count).to eq(1)
      end
      within(biz) { DayClose.create!(branch_id: branch.id, business_day: branch.business_day_for(7.days.ago), locked_at: Time.current) }
      api_post "/api/v1/orders", { order_type: "takeaway", client_created_at: 30.days.ago.iso8601, lines: [ { product_id: m[:chai].id } ], place: true }, headers: admin
      expect(response).to have_http_status(:conflict)
      expect(json[:error][:code]).to eq("day.locked")
      push([ chai_order(client_created_at: 30.days.ago.iso8601) ])
      expect(first_result).to include(status: "rejected", code: "day.locked")
    end
  end
end

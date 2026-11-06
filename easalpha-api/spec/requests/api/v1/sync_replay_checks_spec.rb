require "rails_helper"

# Final fix round (6 Nov 2026, night), sync package: queued shift records get the checks the shift endpoints make; the
# till's clock on payments and shifts stays in the orders' window; a PIN two staff share approves as it does online;
# an old till's split tip is taken once; an update names an offline order's lines by the till's ids; a close may come
# with its own id.
RSpec.describe "Sync replay: shift checks, clock, shared PIN, split tips, till line ids", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:admin) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:device) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T5") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let(:waiter) { add_member!(biz, "waiter", pin: "3333") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }
  let(:pos) { auth_headers(cashier, app: "pos", device: device) }

  before { within(biz) { PaymentMethod.seed_defaults!(biz) unless PaymentMethod.exists? } }

  def push(records, headers: pos) = api_post("/api/v1/sync/push", { records: records }, headers: headers)
  def results = json[:results]
  def as(member) = auth_headers(member, app: "pos", device: device)
  def open_shift!(member, at: branch) = within(biz) { Shifts::Manager.open!(cashier: member, branch: at, device: device, opening_cash_minor: 100_000) }
  def chai(qty = 1, id: nil) = { id: id, product_id: m[:chai].id, quantity: qty }.compact
  def order(id, by: cashier, **payload) = { type: "order", id: id, membership_id: by.id, payload: { order_type: "takeaway", status: "placed", lines: [ chai ] }.merge(payload) }
  def movement(shift, by:, kind: "payout", amount: 60_000) = { type: "cash_movement", id: SecureRandom.uuid, membership_id: by.id, payload: { shift_id: shift.id, kind: kind, amount_minor: amount, reason: "Gas cylinder" } }
  def close(shift, by:, counted: 100_000, id: shift.id) = { type: "shift_close", id: id, membership_id: by.id, payload: { counted_cash_minor: counted } }

  describe "shift records (sync-auth#1)" do
    it "refuses a waiter's payout from the cashier's drawer, a close of the cashier's shift and a shift of their own, as online" do
      shift = open_shift!(cashier)
      push([ movement(shift, by: waiter), close(shift, by: waiter, counted: 40_000),
             { type: "shift_open", id: SecureRandom.uuid, membership_id: waiter.id, payload: { opening_cash_minor: 0, client_created_at: Time.current.iso8601 } } ], headers: as(waiter))
      expect(results.map { |r| [ r[:status], r[:code] ] }).to eq([ %w[rejected permission.denied] ] * 3), response.body
      within(biz) do
        expect(shift.reload).to be_open
        expect(CashMovement.count).to eq(0)
        expect(Shift.count).to eq(1)
      end
    end

    it "keeps a cashier to their own shift and a valid kind; a manager may close anyone's; another branch's shift is not found" do
      other = add_member!(biz, "cashier", pin: "2222")
      theirs = open_shift!(other)
      push([ movement(theirs, by: cashier, kind: "cash_out", amount: 500), close(theirs, by: cashier) ])
      expect(results.map { |r| r[:code] }).to eq(%w[permission.denied permission.denied])
      mine = open_shift!(cashier)
      push([ movement(mine, by: cashier, kind: "bonus"), movement(mine, by: cashier, kind: "cash_in", amount: 1_000) ])
      expect(results.map { |r| r[:code] || r[:status] }).to eq(%w[cash.kind accepted])
      push([ close(theirs, by: manager) ], headers: as(manager))
      expect(results.first[:status]).to eq("accepted"), response.body
      expect(within(biz) { theirs.reload.status }).to eq("closed")

      far_branch = within(biz) { Branch.create!(name: "Gulberg", code: "GUL") }
      far = open_shift!(add_member!(biz, "cashier", pin: "5555"), at: far_branch)
      push([ movement(far, by: manager), close(far, by: manager) ], headers: as(manager))
      expect(results.map { |r| r[:code] }).to eq(%w[not_found not_found])
      expect(within(biz) { far.reload }).to be_open
    end

    it "keeps the payroll rule that a fingerprint check-in comes before the close" do
      api_post "/api/v1/employees", { name: "Till Cashier", base_salary_minor: 1_000_000, membership_id: cashier.id }, headers: admin
      emp = json
      api_put "/api/v1/employees/rules", { employee_id: emp[:id], require_fingerprint_to_close_shift: true }, headers: admin
      shift = open_shift!(cashier)
      push([ close(shift, by: cashier) ])
      expect(results.first).to include(status: "rejected", code: "shift.fingerprint_required")
      api_post "/api/v1/attendance/check_in", { employee_id: emp[:id], source: "fingerprint" }, headers: admin
      push([ close(shift, by: cashier) ])
      expect(results.first[:status]).to eq("accepted"), response.body
    end

    it "closes a shift from a close record with its own id (so it never replaces the queued open), once" do
      shift = open_shift!(cashier)
      rec = { type: "shift_close", id: SecureRandom.uuid, membership_id: cashier.id, payload: { shift_id: shift.id, counted_cash_minor: 100_000 } }
      push([ rec ])
      expect(results.first[:status]).to eq("accepted"), response.body
      expect(within(biz) { shift.reload.status }).to eq("closed")
      push([ rec ])
      expect(results.first[:status]).to eq("duplicate")
    end
  end

  describe "the till's clock on money and shifts (sync-auth#2)" do
    it "dates a replayed payment in the order's window, so the sale and its money land on one day" do
      id, pay = SecureRandom.uuid, SecureRandom.uuid
      old = 10.days.ago
      push([ order(id, client_created_at: old.iso8601, payments: [ { id: pay, method_code: "cash", amount_minor: 9_280, tendered_minor: 10_000, client_created_at: (old + 2.minutes).iso8601 } ]) ])
      expect(results.first[:status]).to eq("accepted"), response.body
      within(biz) do
        o, p = Order.find(id), Payment.find(pay)
        expect(o.status).to eq("paid")
        expect(p.business_day).to eq(o.business_day)
        expect(p.client_created_at).to be_within(1.minute).of(7.days.ago)
        expect(AuditLog.where(action: "client_time_clamped", record_id: pay).count).to eq(1)
      end

      # A payment record of its own, from a till whose clock says next year, is dated today.
      later, pay2 = SecureRandom.uuid, SecureRandom.uuid
      push([ order(later) ])
      push([ { type: "payment", id: pay2, membership_id: cashier.id, payload: { order_id: later, method_code: "cash", amount_minor: 9_280, tendered_minor: 9_280, client_created_at: 1.year.from_now.iso8601 } } ])
      expect(results.first[:status]).to eq("accepted"), response.body
      expect(within(biz) { Payment.find(pay2).business_day }).to eq(today_for(biz))
    end

    it "refuses an order whose payment time cannot be read before writing anything" do
      id = SecureRandom.uuid
      push([ order(id, payments: [ { id: SecureRandom.uuid, method_code: "cash", amount_minor: 9_280, client_created_at: "yesterday" } ]) ])
      expect(results.first).to include(status: "rejected", code: "order.client_time")
      expect(within(biz) { Order.exists?(id: id) }).to be false
    end

    it "keeps a shift opened offline in the same window, and refuses one whose own day is locked" do
      sid = SecureRandom.uuid
      push([ { type: "shift_open", id: sid, membership_id: cashier.id, payload: { opening_cash_minor: 0, client_created_at: 30.days.ago.iso8601 } } ])
      expect(results.first[:status]).to eq("accepted"), response.body
      day = branch.business_day_for(7.days.ago)
      within(biz) do
        expect(Shift.find(sid).business_day).to eq(day)
        expect(AuditLog.where(action: "client_time_clamped", record_id: sid).count).to eq(1)
      end
      push([ close(within(biz) { Shift.find(sid) }, by: cashier, counted: 0) ])
      within(biz) { DayClose.create!(branch_id: branch.id, business_day: day, locked_at: Time.current) }
      again = SecureRandom.uuid
      push([ { type: "shift_open", id: again, membership_id: cashier.id, payload: { opening_cash_minor: 0, client_created_at: 30.days.ago.iso8601 } } ])
      expect(results.first).to include(status: "rejected", code: "day.locked")
      expect(within(biz) { Shift.exists?(id: again) }).to be false
    end
  end

  describe "a PIN two staff share (sync-auth#7)" do
    it "approves each step with the holder who has its permission, with approval codes and without" do
      sharer = add_member!(biz, "waiter", pin: "4444") # joined first, holds no orders.void
      boss = add_member!(biz, "manager", pin: "4444")
      ids = Array.new(2) { SecureRandom.uuid }
      push(ids.map { |i| order(i) })
      voids = ids.map { |i| { type: "void", id: SecureRandom.uuid, membership_id: cashier.id, payload: { order_id: i, reason: "Wrong table" } } }
      push([ voids[0].merge(approver_pin: "4444", approval_codes: [ "orders.void" ]), voids[1].merge(approver_pin: "4444") ])
      expect(results.map { |r| r[:status] }).to eq(%w[accepted accepted]), response.body
      within(biz) do
        expect(Void.where(order_id: ids).pluck(:approved_by_membership_id)).to eq([ boss.id, boss.id ])
        expect(Void.where(order_id: ids).pluck(:approved_by_membership_id)).not_to include(sharer.id)
      end
    end
  end

  describe "money taken by a role without payments.take (item 13)" do
    let(:cash) { { method_code: "cash", amount_minor: 9_280, tendered_minor: 10_000 } }

    it "refuses a waiter's paid order, payment or Try again until a manager's PIN comes with it, and logs the manager" do
      as_waiter = as(waiter)
      paid = SecureRandom.uuid
      rec = order(paid, by: waiter, payments: [ cash.merge(id: SecureRandom.uuid) ])
      push([ rec ], headers: as_waiter)
      expect(results.first).to include(status: "rejected", code: "approval.required", details: include(permissions: [ "payments.take" ]))
      expect(within(biz) { Order.exists?(id: paid) }).to be false
      push([ rec.merge(approver_pin: "9999", approval_codes: [ "payments.take" ]) ], headers: as_waiter)
      expect(results.first[:status]).to eq("accepted"), response.body
      within(biz) do
        expect(Order.find(paid).payment_status).to eq("paid")
        expect(AuditLog.where(action: "approve", record_id: paid).sole).to have_attributes(approved_by_user_id: manager.user_id)
      end

      open = SecureRandom.uuid
      push([ order(open, by: waiter) ], headers: as_waiter)
      pay = { type: "payment", id: SecureRandom.uuid, membership_id: waiter.id, payload: cash.merge(order_id: open) }
      push([ pay ], headers: as_waiter)
      expect(results.first).to include(status: "rejected", code: "approval.required")
      push([ pay.merge(approver_pin: "9999", approval_codes: [ "payments.take" ]) ], headers: as_waiter)
      expect(results.first[:status]).to eq("accepted"), response.body

      # The order is on the server; sent again with its payment (Try again), the payment still needs the manager.
      again = SecureRandom.uuid
      push([ order(again, by: waiter) ], headers: as_waiter)
      retry_rec = order(again, by: waiter, payments: [ cash.merge(id: SecureRandom.uuid) ])
      push([ retry_rec ], headers: as_waiter)
      expect(results.first).to include(status: "rejected", code: "approval.required")
      push([ retry_rec.merge(approver_pin: "9999", approval_codes: [ "payments.take" ]) ], headers: as_waiter)
      expect(results.first[:status]).to eq("accepted"), response.body
      expect(within(biz) { Order.where(id: [ paid, open, again ]).pluck(:payment_status).uniq }).to eq([ "paid" ])
    end

    it "takes the cashier's own payments with no PIN" do
      id = SecureRandom.uuid
      push([ order(id, payments: [ cash.merge(id: SecureRandom.uuid) ]) ])
      expect(results.first[:status]).to eq("accepted"), response.body
      expect(within(biz) { AuditLog.where(action: "approve", record_id: id).count }).to eq(0)
    end
  end

  describe "an old till's split tips (deploy#6)" do
    it "takes the tip once when every split of an offline payment carries it" do
      id = SecureRandom.uuid
      push([ order(id) ])
      splits = [ { method_code: "cash", amount_minor: 5_000, tendered_minor: 5_000 }, { method_code: "card", amount_minor: 9_280, reference: "4242" } ]
      push(splits.map { |s| { type: "payment", id: SecureRandom.uuid, membership_id: cashier.id, payload: s.merge(order_id: id, tip_minor: 5_000) } })
      expect(results.map { |r| r[:status] }).to eq(%w[accepted accepted]), response.body
      within(biz) do
        o = Order.find(id)
        expect(o).to have_attributes(tip_minor: 5_000, total_minor: 14_280, paid_minor: 14_280, payment_status: "paid")
        expect(AuditLog.where(action: "offline_payment_adjusted", record_id: id).sole.after).to include("tip_minor" => 0, "reason" => "the order already has a tip")
      end
    end
  end

  describe "an update of an order made offline (web-till#3)" do
    it "finds the order's lines by the till's own ids, and places a draft the till sent to the kitchen" do
      id, line, naan = SecureRandom.uuid, SecureRandom.uuid, SecureRandom.uuid
      push([ order(id, status: "draft", lines: [ chai(1, id: line) ]) ])
      expect(within(biz) { Order.find(id).status }).to eq("draft")
      push([ { type: "order_update", id: id, membership_id: cashier.id, payload: { client_seq: "1", status: "placed", lines: [ chai(2, id: line), { id: naan, product_id: m[:burger].id, quantity: 1 } ] } } ])
      expect(results.first[:status]).to eq("accepted"), response.body
      within(biz) do
        o = Order.find(id)
        expect(o.status).to eq("placed")
        expect(o.items.map { |i| [ i.name_snapshot, i.quantity.to_i, i.status ] }).to contain_exactly([ "Chai", 2, "sent" ], [ "Zinger Burger", 1, "sent" ])
        expect(KitchenTicket.where(order_id: id).pluck(:kind).uniq).to eq(%w[new]) # one per station, nothing cancelled
      end
      # The next update names the line it added by the till's id too.
      push([ { type: "order_update", id: id, membership_id: cashier.id, payload: { client_seq: "2", lines: [ chai(2, id: line), { id: naan, product_id: m[:burger].id, quantity: 1, notes: "No mayo" } ] } } ])
      expect(results.first[:status]).to eq("accepted"), response.body
      within(biz) do
        items = Order.find(id).items
        expect(items.count(&:cancelled?)).to eq(0)
        expect(items.find { |i| i.name_snapshot == "Zinger Burger" }.notes).to eq("No mayo")
      end
    end
  end
end

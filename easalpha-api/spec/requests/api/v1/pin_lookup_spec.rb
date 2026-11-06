require "rails_helper"

# Review of 6 Nov 2026, R3: a PIN sign-in or approval checked a bcrypt per member with a PIN (2.9 s for twelve at cost
# 12). PINs are now found by memberships.pin_lookup; only members without one are bcrypt-checked, and they get one on a
# match. The checks count bcrypt calls instead of timing anything.
RSpec.describe "PIN lookup for sign-in, approvals and attendance", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:till) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current) } }
  let(:kitchen) { within(biz) { Device.create!(branch: Branch.first, name: "Kitchen", kind: "kitchen", paired_at: Time.current) } }

  def pin_login(pin, device: till) = api_post("/api/v1/devices/pin_login", { pin: pin }, headers: device_headers(device))
  def approver(pin, permission, exclude: nil) = within(biz) { Auth::PinApproval.find_approver(pin: pin, permission: permission, exclude_membership: exclude) }
  # A PIN set before pin_lookup existed: the digest alone.
  def legacy!(member) = member.tap { |m| m.update_columns(pin_lookup: nil) }
  def spy_bcrypt! = allow(BCrypt::Password).to receive(:new).and_call_original

  let!(:cashier) { add_member!(biz, "cashier", pin: "1111") }
  let!(:waiter) { add_member!(biz, "waiter", pin: "2222") }
  let!(:cook) { add_member!(biz, "kitchen", pin: "3333") }
  let!(:manager) { add_member!(biz, "manager", pin: "9999") }

  it "keeps the lookup as an HMAC of the business and the PIN, never in the audit log, the same PIN in two businesses differing" do
    within(biz) do
      expect(cashier.reload.pin_lookup).to eq(Membership.pin_lookup_for(biz.id, "1111"))
      expect(cashier.pin_lookup).not_to include("1111")
    end
    other = signup_business(name: "Other Grill")
    twin = add_member!(other.business, "cashier", pin: "1111")
    expect(within(other.business) { twin.reload.pin_lookup }).not_to eq(within(biz) { cashier.reload.pin_lookup })
    rows = AuditLog.where(business_id: biz.id).pluck(:before, :after).to_json
    expect(rows).not_to include("pin_lookup", cashier.pin_lookup.split(":").last)
  end

  it "signs in and approves by the lookup alone: no bcrypt check for anyone" do
    spy_bcrypt!
    pin_login("1111")
    expect(response).to have_http_status(:ok)
    expect(json[:membership][:id]).to eq(cashier.id)
    expect(approver("9999", "orders.void", exclude: cashier)).to eq(manager)
    pin_login("8080")
    expect(json.dig(:error, :code)).to eq("pin.invalid")
    expect(approver("8080", "orders.void", exclude: cashier)).to be_nil
    expect(BCrypt::Password).not_to have_received(:new)
  end

  it "resolves a shared PIN as before: the member who may use this device's app, or who holds the permission" do
    accountant = add_member!(biz, "accountant", pin: "1111") # shares the cashier's PIN, cannot open the POS
    pin_login("1111")
    expect(json[:membership][:id]).to eq(cashier.id)
    within(biz) { waiter.set_pin!("3333") } # shares the cook's PIN; only the cook opens the kitchen display
    pin_login("3333", device: kitchen)
    expect(json[:membership][:id]).to eq(cook.id)
    pin_login("3333")
    expect(json[:membership][:id]).to eq(waiter.id)
    within(biz) { cashier.set_pin!("9999") } # the cashier and the manager share one: only the manager may void
    expect(approver("9999", "orders.void", exclude: accountant)).to eq(manager)
    # Someone who holds the PIN but may not use the app is refused as before, not told the PIN is wrong.
    pin_login("1111", device: kitchen)
    expect(response).to have_http_status(:forbidden)
    expect(json.dig(:error, :code)).to eq("app.denied")
  end

  it "falls back to bcrypt for members without a lookup, only for them, and stores the lookup on a match" do
    legacy!(cook)
    legacy!(waiter)
    spy_bcrypt!
    pin_login("7070")
    expect(json.dig(:error, :code)).to eq("pin.invalid")
    expect(BCrypt::Password).to have_received(:new).twice # the two without a lookup; never the cashier or the manager
    pin_login("3333", device: kitchen)
    expect(json[:membership][:id]).to eq(cook.id)
    expect(within(biz) { cook.reload.pin_lookup }).to eq(within(biz) { Membership.pin_lookup_for(biz.id, "3333") })
    expect(within(biz) { waiter.reload.pin_lookup }).to be_nil # not matched, nothing learned
    RSpec::Mocks.space.proxy_for(BCrypt::Password).reset
    spy_bcrypt!
    pin_login("3333", device: kitchen)
    expect(json[:membership][:id]).to eq(cook.id)
    expect(BCrypt::Password).not_to have_received(:new) # found by the lookup, and enough: the waiter is not checked
  end

  it "prefers a member without a lookup who may use the app over one found by the lookup who may not" do
    within(biz) { waiter.set_pin!("3333") }
    legacy!(cook)
    pin_login("3333", device: kitchen)
    expect(json[:membership][:id]).to eq(cook.id)
    expect(within(biz) { cook.reload.pin_lookup }).to be_present
  end

  it "backfills an approver found by bcrypt, and a lookup from an earlier server key counts as none" do
    within(biz) { manager.update_columns(pin_lookup: "0ld0key0:#{'a' * 64}") }
    expect(approver("9999", "orders.void", exclude: cashier)).to eq(manager)
    expect(within(biz) { manager.reload.pin_lookup }).to eq(within(biz) { Membership.pin_lookup_for(biz.id, "9999") })
  end

  it "drops a lookup whose digest was written another way, and keeps it when the same PIN is set again" do
    within(biz) do
      cashier.update!(pin_digest: BCrypt::Password.create("6060"))
      expect(cashier.reload.pin_lookup).to be_nil
      cashier.set_pin!("6060")
      expect(cashier.reload.pin_lookup).to eq(Membership.pin_lookup_for(biz.id, "6060"))
      cashier.set_pin!("6060")
      expect(cashier.reload.pin_lookup).to eq(Membership.pin_lookup_for(biz.id, "6060"))
    end
    pin_login("6060")
    expect(json[:membership][:id]).to eq(cashier.id)
  end

  it "still locks the till after five wrong PINs and skips a locked member" do
    allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
    within(biz) { cashier.update_columns(pin_locked_until: 10.minutes.from_now) }
    pin_login("1111")
    expect(json.dig(:error, :code)).to eq("pin.invalid")
    4.times { pin_login("8080") }
    pin_login("2222")
    expect(json.dig(:error, :code)).to eq("pin.locked")
  end

  describe "attendance by PIN" do
    let(:headers) { auth_headers(owner) }
    let!(:employee) { within(biz) { Employee.create!(name: "Cook", membership_id: cook.id, base_salary_minor: 3_000_000, joined_on: Date.current - 30) } }

    it "finds the employee by the lookup and counts a wrong PIN against the caller, not against every member" do
      allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new)
      spy_bcrypt!
      api_post "/api/v1/attendance/check_in", { pin: "3333", source: "pin" }, headers: headers
      expect(response).to have_http_status(:created), response.body
      expect(json[:employee_id]).to eq(employee.id)
      expect(BCrypt::Password).not_to have_received(:new)
      5.times { api_post "/api/v1/attendance/check_in", { pin: "8080", source: "pin" }, headers: headers }
      expect(within(biz) { Membership.where(id: [ cashier.id, waiter.id, cook.id, manager.id ]).pluck(:pin_failed_count) }).to all(eq(0))
      api_post "/api/v1/attendance/check_in", { pin: "3333", source: "pin" }, headers: headers
      expect(json.dig(:error, :code)).to eq("pin.locked")
      pin_login("3333", device: kitchen) # the cook's own sign-in is untouched
      expect(json[:membership][:id]).to eq(cook.id)
    end
  end
end

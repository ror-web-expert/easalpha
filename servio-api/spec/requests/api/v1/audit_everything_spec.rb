require "rails_helper"

# SPEC Audit Logs: every create, update and delete, append-only, filtered by date, actor, action and entity, with insights.
RSpec.describe "Audit log of every change", type: :request do
  let!(:owner) { signup_business }
  let(:headers) { auth_headers(owner) }
  let(:cashier) { within(owner.business) { Membership.create!(user: create(:user), role: Role.find_by!(system_key: "cashier"), status: "active") } }

  def rows(query = "")
    get "/api/v1/audit_logs#{query}", headers: headers
    json[:data]
  end

  it "writes one row per create, update and archive, with the changed attributes and the actor's name" do
    api_post "/api/v1/customers", { name: "Ali", phone: "03001234567" }, headers: headers
    expect(response).to have_http_status(:created)
    id = json[:id]
    created = rows("?table_name=customers&action_name=create&record_id=#{id}")
    expect(created.size).to eq(1)
    expect(created.first[:user_name]).to eq(owner.user.name)
    expect(created.first[:after][:name]).to eq("Ali")

    api_patch "/api/v1/customers/#{id}", { name: "Ali Khan" }, headers: headers
    updated = rows("?table_name=customers&action_name=update&record_id=#{id}")
    expect(updated.size).to eq(1)
    expect(updated.first[:before]).to include(name: "Ali")
    expect(updated.first[:after]).to include(name: "Ali Khan")
    expect(updated.first[:after].keys).not_to include(:updated_at)

    delete "/api/v1/customers/#{id}", headers: headers
    expect(rows("?table_name=customers&action_name=delete&record_id=#{id}").size).to eq(1)
  end

  it "names a status move as status_change and an archive as delete" do
    within(owner.business) do
      t = DiningTable.create!(branch: Branch.first, code: "T9", name: "T9", seats: 4)
      t.update!(status: "occupied")
      expect(AuditLog.where(table_name: "dining_tables", record_id: t.id).order(:occurred_at, :created_at).pluck(:action)).to eq(%w[create status_change])
      t.update!(archived_at: Time.current)
      expect(AuditLog.where(table_name: "dining_tables", record_id: t.id).order(:occurred_at, :created_at).pluck(:action).last).to eq("delete")
    end
    expect(AuditLog::ACTIONS).to include("cancel", "receive", "ledger_debit", "ledger_credit", "bulk_update", "bulk_delete")
  end

  it "skips housekeeping tables and attributes" do
    within(owner.business) do
      d = Device.create!(branch: Branch.first, name: "Till", kind: "till")
      before = AuditLog.where(table_name: "devices", record_id: d.id).count
      d.update!(last_seen_at: Time.current)
      expect(AuditLog.where(table_name: "devices", record_id: d.id).count).to eq(before)
      expect(Setting.audited?).to be false
      expect(StockLevel.audited?).to be false
      expect(Customer.audited?).to be true
    end
  end

  it "cannot be changed or erased" do
    row = within(owner.business) { AuditLog.where(business_id: owner.business_id).first! }
    expect(row.readonly?).to be true
    expect { AuditLog.transaction(requires_new: true) { AuditLog.where(id: row.id).update_all(action: "hidden") } }.to raise_error(ActiveRecord::StatementInvalid, /append-only/)
    expect { AuditLog.transaction(requires_new: true) { AuditLog.where(id: row.id).delete_all } }.to raise_error(ActiveRecord::StatementInvalid, /append-only/)
  end

  it "filters by date range and actor, lists entities, and reports insights" do
    api_post "/api/v1/customers", { name: "B", phone: "03009876543" }, headers: headers
    expect(rows("?from=#{Date.current}&to=#{Date.current}&user_id=#{owner.user_id}&table_name=customers&record_id=#{json[:id]}").size).to eq(1)
    expect(rows("?from=2020-01-01&to=2020-01-02")).to be_empty
    get "/api/v1/audit_logs/entities", headers: headers
    expect(json[:data]).to include("customers")
    expect(json[:actions]).to include("status_change")
    get "/api/v1/audit_logs/insights?from=#{Date.current}", headers: headers
    expect(json[:total]).to be > 0
    expect(json[:by_action].keys).to include(:create)
    expect(json[:by_actor].first[:name]).to eq(owner.user.name)
  end

  it "needs audit.view or reports.view_all" do
    get "/api/v1/audit_logs", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/audit_logs/insights", headers: auth_headers(cashier)
    expect(response).to have_http_status(:forbidden)
  end

  it "does not duplicate a row a controller already wrote for the same change" do
    api_post "/api/v1/staff", { name: "H", email: "h@x.com", role_id: within(owner.business) { Role.find_by!(system_key: "cashier").id } }, headers: headers
    expect(rows("?table_name=memberships&action_name=create&record_id=#{json[:id]}").size).to eq(1)
  end
end

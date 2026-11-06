require "rails_helper"

# Review of 6 Nov 2026, R16: actions written since the receipt work (client_time_clamped, offline_payment_adjusted,
# the offline khata ones and others) were missing from AuditLog::ACTIONS, so the admin's Audit Logs filter could not
# pick them. This reads every audit call in the code and holds the list (and its labels) to what is really written.
RSpec.describe "Audit log actions", type: :request do
  # Written under another name in practice: Finance::Journal records only manual vouchers, whose action is create.
  let(:never_written) { %w[journal_post] }

  # The string literals an audit call can write as its action. A ternary's condition is not an action, only its branches.
  def written_actions
    Dir[Rails.root.join("app/**/*.rb"), Rails.root.join("lib/**/*.rb")].flat_map do |file|
      text = File.read(file)
      exprs = text.scan(/AuditLog\.record(?:_change)?\([^()]*?action:\s*([^,]+)/).flatten + text.scan(/\baudit!\(([^,()]+)/).flatten
      exprs.flat_map { |e| (e.include?("?") ? e.split("?", 2).last : e).scan(/"([a-z_]+)"/).flatten }
    end.uniq
  end

  it "lists every action the code writes, each with a label" do
    written = written_actions
    expect(written).to include("client_time_clamped", "offline_payment_adjusted", "khata_over_limit_offline", "khata_overdue_offline", "approve") # the scan works
    expect(written - never_written - AuditLog::ACTIONS).to eq([])
    # Built from a kind or a status: every value those can take.
    expect(AuditLog::ACTIONS).to include(*%w[issue return spend adjust].map { |k| "rider_float_#{k}" }, *%w[confirmed no_show cancelled completed].map { |s| "reservation_#{s}" })
    expect(AuditLog::ACTION_LABELS.values).to all(be_present)
    expect(AuditLog::ACTION_LABELS.values.uniq.size).to eq(AuditLog::ACTION_LABELS.size)
  end

  it "gives the admin filter every action with its label" do
    owner = signup_business
    get "/api/v1/audit_logs/entities", headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    expect(json[:actions]).to eq(AuditLog::ACTIONS)
    expect(json[:action_labels]).to include(client_time_clamped: "Till clock corrected", khata_over_limit_offline: "Khata over limit (offline)", approve: "Manager approval")
  end

  it "filters the log by one of the new actions" do
    owner = signup_business
    within(owner.business) do
      Current.user = owner.user
      AuditLog.record(action: "client_time_clamped", table_name: "orders", record_id: SecureRandom.uuid, after: { clamped_to: Time.current.iso8601 })
      AuditLog.record(action: "update", table_name: "orders", record_id: SecureRandom.uuid)
    end
    get "/api/v1/audit_logs", params: { action_name: "client_time_clamped" }, headers: auth_headers(owner)
    expect(json[:data].map { |a| a[:action] }).to eq([ "client_time_clamped" ])
  end
end

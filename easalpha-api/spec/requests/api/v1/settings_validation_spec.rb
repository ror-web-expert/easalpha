require "rails_helper"

# S11, S13, S14 (6 Nov 2026): alert amounts were asked for in paisa, errors named setting keys
# ("security.expense_report_pin must be 4 digits"), labels read "percent or fixed", and nonsense was saved as typed:
# bill day 45, a credit hold of -5 days, 2.5 days kept as 2, a store time zone of "Pakistan".
RSpec.describe "Settings validation and labels", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  def patch_settings(values) = api_patch("/api/v1/settings", { values: values }, headers: headers)

  it "refuses numbers outside their range or with a fraction, naming the setting as the screen does" do
    patch_settings("khata.monthly_bills.day" => 45)
    expect(response).to have_http_status(:bad_request)
    expect(json[:error][:message]).to eq("Day of the month the bills go out: enter a number from 1 to 28")
    patch_settings("khata.credit_hold_days" => -5)
    expect(json[:error][:message]).to eq("Refuse new sales on account when a bill is this many days overdue: enter a number from 0 to 365")
    patch_settings("khata.credit_hold_days" => 2.5)
    expect(json[:error][:message]).to eq("Refuse new sales on account when a bill is this many days overdue: enter a whole number")
    patch_settings("security.expense_report_pin" => "12")
    expect(json[:error][:message]).to eq("PIN asked before expenses and reports open on the POS: enter exactly 4 digits")
    expect(json[:error][:message]).not_to include("security.")
    patch_settings("khata.monthly_bills.day" => 28, "khata.credit_hold_days" => "3")
    expect(response).to have_http_status(:ok)
    within(biz) { expect(Setting.effective(biz).values_at("khata.monthly_bills.day", "khata.credit_hold_days")).to eq([ 28, 3 ]) }
  end

  it "keeps alert amounts in paisa behind a money type the screen shows in rupees, with plain labels" do
    get "/api/v1/settings", headers: headers
    keys = json[:groups].values.flat_map { |g| g[:screens].values.flatten }.index_by { |k| k[:key] }
    expect(keys["big_void_alert_minor"]).to include(type: "money", value: 500_000, label: "WhatsApp the owner when a void is above this amount")
    expect(keys.values.map { |k| k[:label] }.join(" ")).not_to match(/in paisa|percent or fixed|sandbox or production|PLACE_UNPAID_DIRECT/)
    patch_settings("big_void_alert_minor" => 750_050)
    expect(response).to have_http_status(:ok)
    within(biz) { expect(biz.reload.setting("big_void_alert_minor")).to eq(750_050) }
    patch_settings("cash_short_alert_minor" => -100)
    expect(json[:error][:message]).to eq("WhatsApp the owner when a till is short by more than this amount: cannot be negative")
  end

  it "takes a store time zone, country and currency only in a form the business day can use" do
    api_patch "/api/v1/business", { time_zone: "Pakistan" }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
    expect(json[:error][:message]).to eq("Time zone must be a time zone such as Asia/Karachi")
    api_patch "/api/v1/business", { currency: "dollars" }, headers: headers
    expect(json[:error][:message]).to include("Currency must be a three-letter currency code")
    api_patch "/api/v1/business", { country: "ae", currency: "aed", time_zone: "Asia/Dubai" }, headers: headers
    expect(response).to have_http_status(:ok)
    expect(json).to include(country: "AE", currency: "AED", time_zone: "Asia/Dubai")
    api_patch "/api/v1/branches/#{within(biz) { Branch.first.id }}", { time_zone: "Lahore" }, headers: headers
    expect(response).to have_http_status(:unprocessable_content)
  end
end

require "rails_helper"

RSpec.describe "Billing, onboarding, support, alerts", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  it "shows the plan, usage and invoices, lets the owner choose a plan, report payment, and Servio confirms it" do
    get "/api/v1/billing", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:plans].map { |p| p[:code] }).to eq(%w[starter pro business])
    expect(json[:usage][:staff][:used]).to eq(1)
    expect(json[:business][:status]).to eq("trial")

    api_post "/api/v1/billing/choose_plan", { plan_code: "business", cycle: "yearly", tills: 3 }, headers: headers
    expect(response).to have_http_status(:created)
    inv = json[:invoice]
    expect(inv[:amount_minor]).to eq(8_999_00 * 10)            # yearly = 10 months, business plan allows 10 tills so no extra
    expect(inv[:currency]).to eq("PKR")
    expect(inv[:status]).to eq("open")
    api_post "/api/v1/billing/invoices/#{inv[:id]}/report_payment", { method: "jazzcash", reference: "TXN123" }, headers: headers
    expect(json[:status]).to eq("reported")

    admin = create(:super_admin)
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    super_headers = { "Authorization" => "Bearer #{json[:access_token]}" }
    get "/api/v1/super/invoices?status=reported", headers: super_headers
    expect(json[:data].size).to eq(1)
    api_post "/api/v1/super/invoices/#{inv[:id]}/confirm", {}, headers: super_headers
    expect(response).to have_http_status(:ok)
    expect(json[:business_status]).to eq("active")
    get "/api/v1/billing", headers: headers
    expect(json[:subscription][:status]).to eq("active")
    expect(json[:subscription][:plan_code]).to eq("business")
    expect(json[:business][:plan][:code]).to eq("business")
    expect(Time.parse(json[:subscription][:current_period_end].to_s)).to be > 12.months.from_now  # yearly during trial adds a free month
  end

  it "sends trial reminders at day 60, 80 and 88 and makes the account read-only after the trial" do
    owner.user.update!(phone: "+923001234567")
    biz.update!(trial_ends_on: Date.current + 30)   # day 60 of 90
    BillingLifecycleJob.perform_now(biz.id)
    within(biz) { expect(WhatsappMessage.where(business_id: biz.id, template_name: "trial_reminder").count).to eq(1) }
    BillingLifecycleJob.perform_now(biz.id)
    within(biz) { expect(WhatsappMessage.where(business_id: biz.id, template_name: "trial_reminder").count).to eq(1) }
    biz.update!(trial_ends_on: Date.current + 2)
    BillingLifecycleJob.perform_now(biz.id)
    within(biz) { expect(WhatsappMessage.where(business_id: biz.id, template_name: "trial_reminder").count).to eq(3) }
    biz.update!(trial_ends_on: Date.current - 1)
    BillingLifecycleJob.perform_now(biz.id)
    expect(biz.reload.status).to eq("read_only")
    get "/api/v1/me", headers: headers
    expect(json[:business][:read_only]).to be true
    api_post "/api/v1/menus", { name: "X" }, headers: headers
    expect(response).to have_http_status(:forbidden)
    expect(json[:error][:code]).to eq("business.read_only")
    get "/api/v1/menus", headers: headers
    expect(response).to have_http_status(:ok)
  end

  it "activates through the Paddle webhook and goes to grace then read-only when an invoice stays unpaid" do
    api_post "/api/v1/webhooks/paddle", { event_type: "subscription.activated", data: { id: "sub_1", custom_data: { business_id: biz.id, plan_code: "pro", cycle: "monthly" } } }
    expect(response).to have_http_status(:ok)
    expect(biz.reload.status).to eq("active")
    within(biz) do
      sub = Subscription.order(created_at: :desc).first
      expect(sub.provider).to eq("paddle")
      sub.update!(current_period_end: 2.days.ago)
      Billing::Issuer.issue!(biz, plan: sub.plan, cycle: "monthly", subscription: sub)
    end
    BillingLifecycleJob.perform_now(biz.id)
    expect(biz.reload.status).to eq("grace")
    within(biz) { Subscription.order(created_at: :desc).first.update!(grace_ends_on: Date.current - 1) }
    BillingLifecycleJob.perform_now(biz.id)
    expect(biz.reload.status).to eq("read_only")
  end

  it "loads a sample menu once and reports onboarding status" do
    api_post "/api/v1/onboarding/sample_menu", {}, headers: headers
    expect(response).to have_http_status(:created)
    expect(json[:products]).to eq(13)
    api_post "/api/v1/onboarding/sample_menu", {}, headers: headers
    expect(response).to have_http_status(:conflict)
    get "/api/v1/onboarding/status", headers: headers
    expect(json[:items].find { |i| i[:key] == "menu" }[:done]).to be true
    expect(json[:trial_days_left]).to be_between(89, 90)
  end

  it "support access needs the owner's approval, expires, and is audited" do
    admin = create(:super_admin)
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    super_headers = { "Authorization" => "Bearer #{json[:access_token]}" }
    api_post "/api/v1/super/support_sessions", { business_id: biz.id, reason: "Printer problem ticket 42" }, headers: super_headers
    expect(response).to have_http_status(:created)
    sid = json[:id]
    api_post "/api/v1/super/support_sessions/#{sid}/token", {}, headers: super_headers
    expect(response).to have_http_status(:forbidden)
    get "/api/v1/support_sessions", headers: headers
    expect(json[:data].first[:status]).to eq("requested")
    api_post "/api/v1/support_sessions/#{sid}/approve", {}, headers: headers
    api_post "/api/v1/super/support_sessions/#{sid}/token", {}, headers: super_headers
    expect(response).to have_http_status(:ok)
    get "/api/v1/me", headers: { "Authorization" => "Bearer #{json[:access_token]}" }
    expect(json[:business][:id]).to eq(biz.id)
    get "/api/v1/audit_logs?action_name=login", headers: headers
    expect(json[:data].first[:after][:support_login]).to eq(admin.email)
  end

  it "alerts the owner on a big void and lists WhatsApp templates and messages" do
    owner.user.update!(phone: "+923001234567")
    within(biz) { biz.update!(settings: { "big_void_alert_minor" => 1_000 }) }
    m = build_menu!(biz)
    api_post "/api/v1/orders", { order_type: "walk_in", lines: [ { product_id: m[:burger].id } ], place: true }, headers: headers
    api_post "/api/v1/orders/#{json[:id]}/void", { reason: "Wrong order" }, headers: headers
    within(biz) do
      expect(Notification.where(kind: "big_void").count).to eq(1)
      expect(WhatsappMessage.where(business_id: biz.id, template_name: "alert_big_void").count).to eq(1)
    end
    WhatsappTemplate.seed_defaults!
    get "/api/v1/whatsapp/templates", headers: headers
    expect(json[:data].map { |t| t[:name] }).to include("login_otp", "digital_receipt", "trial_reminder")
    get "/api/v1/whatsapp/messages", headers: headers
    expect(json[:data].first[:template_name]).to eq("alert_big_void")
    get "/api/v1/whatsapp/usage", headers: headers
    expect(json[:used]).to eq(1)
  end
end

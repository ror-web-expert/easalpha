require "rails_helper"

RSpec.describe "Billing, onboarding, support, alerts", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let(:headers) { auth_headers(owner) }

  it "shows the plan, usage and invoices, lets the owner choose a plan, report payment, and EasAlpha confirms it" do
    get "/api/v1/billing", headers: headers
    expect(response).to have_http_status(:ok)
    expect(json[:plans].map { |p| p[:code] }).to eq(%w[starter pro business])
    expect(json[:usage][:staff][:used]).to eq(1)
    expect(json[:business][:status]).to eq("trial")

    api_post "/api/v1/billing/choose_plan", { plan_code: "business", cycle: "yearly", tills: 3 }, headers: headers
    expect(response).to have_http_status(:created)
    inv = json[:invoice]
    expect(inv[:amount_minor]).to eq(8_999_00 * 10)            # yearly = 10 months; Business includes unlimited tills, so no extra
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

  it "starts a new account on the Business plan for 40 days, reminds 7, 3 and 1 day before the end and makes it read-only after" do
    expect(biz.plan.code).to eq("business")
    expect(biz.trial_ends_on).to eq(Date.current + 40)
    owner.user.update!(phone: "+923001234567")
    reminders = -> { within(biz) { WhatsappMessage.where(business_id: biz.id, template_name: "trial_reminder").count } }
    biz.update!(trial_ends_on: Date.current + 10)
    BillingLifecycleJob.perform_now(biz.id)
    expect(reminders.call).to eq(0)
    biz.update!(trial_ends_on: Date.current + 7)
    BillingLifecycleJob.perform_now(biz.id)
    BillingLifecycleJob.perform_now(biz.id)
    expect(reminders.call).to eq(1)
    # The job missed some days: the 3-day and 1-day reminders fall due together and go out as one message.
    biz.update!(trial_ends_on: Date.current + 1)
    BillingLifecycleJob.perform_now(biz.id)
    expect(reminders.call).to eq(2)
    BillingLifecycleJob.perform_now(biz.id)
    expect(reminders.call).to eq(2)
    expect(biz.reload).to have_attributes(trial_reminder_7_at: be_present, trial_reminder_3_at: be_present, trial_reminder_1_at: be_present)
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

  # Paddle signs every event with the webhook secret; the API refuses unsigned ones (29 Oct 2026 review).
  def paddle_post(body, secret: "paddle-test-secret")
    raw = body.to_json
    ts = Time.current.to_i
    post "/api/v1/webhooks/paddle", params: raw, headers: { "Content-Type" => "application/json", "Paddle-Signature" => "ts=#{ts};h1=#{OpenSSL::HMAC.hexdigest('SHA256', secret, "#{ts}:#{raw}")}" }
  end

  it "activates through the Paddle webhook and goes to grace then read-only when an invoice stays unpaid" do
    old = ENV["PADDLE_WEBHOOK_SECRET"]
    ENV["PADDLE_WEBHOOK_SECRET"] = "paddle-test-secret"
    paddle_post({ event_type: "subscription.activated", data: { id: "sub_1", custom_data: { business_id: biz.id, plan_code: "pro", cycle: "monthly" } } })
    ENV["PADDLE_WEBHOOK_SECRET"] = old
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
    expect(json[:trial_days_left]).to be_between(39, 40)
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

  it "includes 10 tills on Pro and unlimited tills on Business (17 Oct 2026)" do
    pro, business = Plan.find_by!(code: "pro"), Plan.find_by!(code: "business")
    expect(pro.limits["tills"]).to eq(10)
    expect(business.limits).to include("tills" => nil, "branches" => 20)
    expect(Billing::Issuer.price_for(pro, cycle: "monthly", currency: "PKR", tills: 10)).to eq(4_999_00)
    expect(Billing::Issuer.price_for(pro, cycle: "monthly", currency: "PKR", tills: 12)).to eq(4_999_00 + 2 * 1_000_00)
    expect(Billing::Issuer.price_for(business, cycle: "monthly", currency: "PKR", tills: 40)).to eq(8_999_00)
    within(biz) do
      biz.update!(plan: business)
      inv = Billing::Issuer.issue!(biz, plan: business, cycle: "monthly", tills: 40)
      expect(inv.lines.map { |l| l["description"] }.grep(/Extra tills/)).to be_empty
    end
  end
end

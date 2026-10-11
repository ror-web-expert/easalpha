require "rails_helper"

RSpec.describe "Help and Support box, platform settings, business logo", type: :request do
  let!(:owner) { signup_business }
  let(:admin) { create(:super_admin) }
  let(:super_headers) do
    api_post "/api/v1/super/login", { email: admin.email, password: "supersecret1" }
    { "Authorization" => "Bearer #{json[:access_token]}" }
  end

  it "serves platform settings publicly and lets the super admin change them" do
    get "/api/v1/platform"
    expect(response).to have_http_status(:ok)
    expect(json[:product_name]).to eq("EasAlpha")
    expect(json[:support_email]).to eq("hello@easalpha.com")
    expect(json[:downloads_url]).to be_nil # blank: the site serves /downloads itself
    expect(json[:desktop_version]).to be_present

    api_put "/api/v1/super/platform_settings", { values: { support_whatsapp: "+92 300 7654321", announcement: "Maintenance Sunday 3 am", unknown_key: "x" } }, headers: super_headers
    expect(response).to have_http_status(:ok)
    expect(json[:values][:support_whatsapp]).to eq("+92 300 7654321")
    expect(json[:values]).not_to have_key(:unknown_key)

    get "/api/v1/platform"
    expect(json[:announcement]).to eq("Maintenance Sunday 3 am")

    api_put "/api/v1/super/platform_settings", { values: { support_whatsapp: "" } }, headers: super_headers
    expect(json[:values][:support_whatsapp]).to eq("+923437172731") # blank restores the default

    get "/api/v1/super/platform_settings", headers: auth_headers(owner)
    expect(response).to have_http_status(:unauthorized)
  end

  it "takes a support request from staff, shows it in the super inbox, and the reply comes back as a notification" do
    api_post "/api/v1/support_requests", { subject: "Printer stopped", message: "The kitchen printer prints blank pages since this morning.", category: "problem", page: "/admin/settings/devices" }, headers: auth_headers(owner)
    expect(response).to have_http_status(:created)
    id = json[:id]
    expect(json[:status]).to eq("open")
    expect(json[:by][:name]).to be_present

    api_post "/api/v1/support_requests", { subject: "", message: "x" }, headers: auth_headers(owner)
    expect(response).to have_http_status(:unprocessable_content)

    get "/api/v1/super/stats", headers: super_headers
    expect(json[:open_support_requests]).to eq(1)

    get "/api/v1/super/support_requests", headers: super_headers
    expect(json[:data].size).to eq(1)
    expect(json[:data].first[:business][:name]).to eq("Karachi Grill")
    expect(json[:data].first[:by][:email]).to eq(owner.user.email)

    api_post "/api/v1/super/support_requests/#{id}/reply", { reply: "Please power-cycle the printer and send a test page from Settings > Signed-in devices." }, headers: super_headers
    expect(response).to have_http_status(:ok)
    expect(json[:status]).to eq("answered")
    expect(json[:replied_at]).to be_present

    get "/api/v1/support_requests", headers: auth_headers(owner)
    expect(json[:data].first[:reply]).to start_with("Please power-cycle")
    within(owner.business) do
      n = Notification.find_by(kind: "support_reply")
      expect(n.title).to include("Printer stopped")
      expect(n.link).to eq("/admin/support")
      expect(n.user_id).to eq(owner.user_id)
    end

    api_post "/api/v1/super/support_requests/#{id}/close", {}, headers: super_headers
    expect(json[:status]).to eq("closed")
    get "/api/v1/super/support_requests?status=open", headers: super_headers
    expect(json[:data]).to be_empty

    get "/api/v1/super/support_requests", headers: auth_headers(owner)
    expect(response).to have_http_status(:unauthorized)
    api_post "/api/v1/support_requests", { subject: "x", message: "y" }
    expect(response).to have_http_status(:unauthorized)
  end

  it "shows a cashier only their own requests while a manager sees all" do
    cashier = add_member!(owner.business, "cashier", pin: "1111")
    api_post "/api/v1/support_requests", { subject: "Owner question", message: "How do I export the ledger?" }, headers: auth_headers(owner)
    api_post "/api/v1/support_requests", { subject: "Cashier question", message: "How do I hold an order?" }, headers: auth_headers(cashier)
    expect(response).to have_http_status(:created)
    get "/api/v1/support_requests", headers: auth_headers(cashier)
    expect(json[:data].map { |r| r[:subject] }).to eq([ "Cashier question" ])
    get "/api/v1/support_requests", headers: auth_headers(owner)
    expect(json[:data].size).to eq(2)
  end

  it "stores the business logo and returns it on the profile, the super detail and the receipt branding" do
    api_patch "/api/v1/business", { logo_key: "http://localhost:3001/api/v1/uploads/abc" }, headers: auth_headers(owner)
    expect(response).to have_http_status(:ok)
    expect(json[:logo_key]).to eq("http://localhost:3001/api/v1/uploads/abc")
    get "/api/v1/business", headers: auth_headers(owner)
    expect(json[:logo_key]).to eq("http://localhost:3001/api/v1/uploads/abc")
    get "/api/v1/super/businesses/#{owner.business_id}", headers: super_headers
    expect(json[:logo_key]).to eq("http://localhost:3001/api/v1/uploads/abc")
    expect(json).to include(:orders_30_days, :open_support_requests, :support_sessions)
    get "/api/v1/super/me", headers: super_headers
    expect(json[:admin][:email]).to eq(admin.email)
    get "/api/v1/super/support_sessions", headers: super_headers
    expect(json[:data]).to eq([])
    get "/api/v1/super/plans", headers: super_headers
    expect(json[:data].map { |p| p[:code] }).to include("starter")
    api_patch "/api/v1/super/businesses/#{owner.business_id}", { plan_id: json[:data].last[:id] }, headers: super_headers
    expect(json[:plan][:code]).to eq(Plan.order(:sort_order, :code).last.code)
  end
end

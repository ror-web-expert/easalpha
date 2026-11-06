require "rails_helper"

# Review of 6 Nov 2026, Security paragraph (A7 to A16): what a till copy says about the staff, who may open the
# kitchen display, the login throttles, guest order ids, the WhatsApp verify token, and uploads judged by their bytes.
RSpec.describe "Security review: staff payload, kitchen auth, throttles, guest ids, webhooks, uploads", type: :request do
  let!(:owner) { signup_business }
  let(:biz) { owner.business }
  let!(:m) { build_menu!(biz) }
  let(:admin) { auth_headers(owner) }
  let(:branch) { within(biz) { Branch.first } }
  let(:till) { within(biz) { Device.create!(branch: Branch.first, name: "Till", kind: "till", paired_at: Time.current, code: "T5") } }
  let(:cashier) { add_member!(biz, "cashier", pin: "1111") }

  describe "A7: the staff list a till downloads" do
    it "carries permissions, limits and the PIN lock only for the member who asked" do
      get "/api/v1/sync/changes", headers: auth_headers(cashier, app: "pos", device: till)
      expect(response).to have_http_status(:ok)
      mine = json[:staff].find { |s| s[:id] == cashier.id }
      theirs = json[:staff].find { |s| s[:id] == owner.id }
      expect(mine).to include(:permissions, :limits, :pin_locked, :user_id)
      expect(mine[:permissions]).to include("orders.create")
      expect(theirs.keys).to contain_exactly(:id, :name, :role, :role_key, :status, :updated_at)
      get "/api/v1/sync/changes", headers: device_headers(till)
      expect(json[:staff].map(&:keys).flatten.uniq).not_to include(:permissions, :limits, :pin_digest)
    end
  end

  describe "A8: the kitchen display" do
    it "opens for a kitchen device or a signed-in cashier, not for a till's device token alone" do
      get "/api/v1/kitchen/orders", headers: device_headers(till)
      expect(response).to have_http_status(:forbidden)
      expect(json[:error][:code]).to eq("session.required")
      api_post "/api/v1/kitchen/orders/#{SecureRandom.uuid}/bump", {}, headers: device_headers(till)
      expect(json[:error][:code]).to eq("session.required")
      get "/api/v1/kitchen/orders", headers: auth_headers(cashier, app: "pos", device: till)
      expect(response).to have_http_status(:ok)
      kds = within(biz) { Device.create!(branch: Branch.first, name: "KDS", kind: "kitchen", paired_at: Time.current, code: "K2") }
      get "/api/v1/kitchen/orders", headers: device_headers(kds)
      expect(response).to have_http_status(:ok)
    end
  end

  describe "A10: login throttles" do
    def request_for(path, body)
      Rack::Attack::Request.new(Rack::MockRequest.env_for(path, method: "POST", input: body.to_json, "CONTENT_TYPE" => "application/json", "REMOTE_ADDR" => "203.0.113.9"))
    end

    it "counts password and super admin logins per address and per email" do
      t = Rack::Attack.throttles
      expect(t.fetch("login/email").block.call(request_for("/api/v1/auth/login", email: " Owner@Example.com ", password: "x"))).to eq("owner@example.com")
      expect(t.fetch("login/email").block.call(request_for("/api/v1/auth/otp/request", phone: "0300"))).to be_nil
      expect(t.fetch("super_login/ip").block.call(request_for("/api/v1/super/login", email: "root@easalpha.com", password: "x"))).to eq("203.0.113.9")
      expect(t.fetch("super_login/email").block.call(request_for("/api/v1/super/login", email: "Root@easalpha.com", password: "x"))).to eq("root@easalpha.com")
      expect(t.fetch("super_login/email").limit).to eq(10)
      expect(t.fetch("super_login/email").period).to eq(10.minutes)
      expect(t.fetch("public/ip").block.call(request_for("/api/v1/qr/abc/orders", {}))).to eq("203.0.113.9")
      expect(t.fetch("public/ip").block.call(request_for("/api/v1/public/storefront/x/orders", {}))).to eq("203.0.113.9")
      expect(t.fetch("public/ip").block.call(request_for("/api/v1/orders", {}))).to be_nil
    end
  end

  describe "A12: QR order ids" do
    let(:table) { within(biz) { DiningTable.create!(branch: branch, code: "T7", seats: 4) } }

    it "answers the same order for a retried submit and never uses the client id as the order id" do
      api_patch "/api/v1/branches/#{branch.id}", { qr_settings: { enabled: true, cashier_accept: true, guest_name: false } }, headers: admin
      client_id = SecureRandom.uuid
      api_post "/api/v1/qr/#{table.qr_token}/orders", { client_id: client_id, lines: [ { product_id: m[:chai].id, quantity: 1 } ] }
      expect(response).to have_http_status(:created), response.body
      first = json[:id]
      expect(first).not_to eq(client_id)
      api_post "/api/v1/qr/#{table.qr_token}/orders", { client_id: client_id, lines: [ { product_id: m[:chai].id, quantity: 1 } ] }
      expect(response).to have_http_status(:created)
      expect(json[:id]).to eq(first)
      within(biz) do
        expect(Order.where(source: "qr").count).to eq(1)
        expect(Order.find(first).aggregator_ref).to eq("qr:#{client_id}")
        expect(Order.exists?(id: client_id)).to be false
      end
    end
  end

  describe "A13: the WhatsApp verify handshake" do
    it "fails closed without WHATSAPP_VERIFY_TOKEN and answers the challenge with it" do
      old = ENV.delete("WHATSAPP_VERIFY_TOKEN")
      get "/api/v1/webhooks/whatsapp", params: { "hub.mode" => "subscribe", "hub.verify_token" => "easalpha", "hub.challenge" => "42" }
      expect(response).to have_http_status(:forbidden)
      ENV["WHATSAPP_VERIFY_TOKEN"] = "s3cret-verify"
      get "/api/v1/webhooks/whatsapp", params: { "hub.mode" => "subscribe", "hub.verify_token" => "easalpha", "hub.challenge" => "42" }
      expect(response).to have_http_status(:forbidden)
      get "/api/v1/webhooks/whatsapp", params: { "hub.mode" => "subscribe", "hub.verify_token" => "s3cret-verify", "hub.challenge" => "42" }
      expect(response).to have_http_status(:ok)
      expect(response.body).to eq("42")
    ensure
      old ? ENV["WHATSAPP_VERIFY_TOKEN"] = old : ENV.delete("WHATSAPP_VERIFY_TOKEN")
    end
  end

  describe "A16: uploads" do
    it "judges the file by its bytes, not by the header the client sends" do
      png_bytes = "\x89PNG\r\n\x1a\n" + "0" * 100
      mislabelled = Rack::Test::UploadedFile.new(StringIO.new(png_bytes), "application/octet-stream", original_filename: "photo.bin")
      post "/api/v1/uploads", params: { file: mislabelled }, headers: { "Authorization" => admin["Authorization"] }
      expect(response).to have_http_status(:created), response.body
      expect(json[:content_type]).to eq("image/png")
      script = Rack::Test::UploadedFile.new(StringIO.new("<html><script>alert(1)</script>"), "image/png", original_filename: "logo.png")
      post "/api/v1/uploads", params: { file: script }, headers: { "Authorization" => admin["Authorization"] }
      expect(response).to have_http_status(:bad_request)
      expect(json[:error][:code]).to eq("upload.type")
    end
  end
end

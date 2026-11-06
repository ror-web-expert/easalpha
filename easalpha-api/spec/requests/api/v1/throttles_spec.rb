require "rails_helper"

# Final fix round (6 Nov 2026, night): the per-account login limit reads the email however it is sent (sync-auth#3),
# and QR table ordering is counted per table, reading apart from sending, instead of under the storefront's 120 a
# minute per address that a restaurant's shared Wi-Fi ran out (sync-auth#5, deploy#4).
RSpec.describe "Request throttles", type: :request do
  let(:throttles) { Rack::Attack.throttles }

  def req(path, method: "POST", body: nil, type: "application/json")
    env = Rack::MockRequest.env_for(path, method: method, input: body.to_s, "CONTENT_TYPE" => type, "REMOTE_ADDR" => "203.0.113.9")
    Rack::Attack::Request.new(env)
  end

  def key(name, request) = throttles.fetch(name).block.call(request)

  describe "login/email" do
    it "counts the account whether the email comes as JSON, as a form or in the query string" do
      expect(key("login/email", req("/api/v1/auth/login", body: { email: " Owner@Example.com ", password: "x" }.to_json))).to eq("owner@example.com")
      expect(key("login/email", req("/api/v1/auth/login", body: "email=Owner%40Example.com&password=x", type: "application/x-www-form-urlencoded"))).to eq("owner@example.com")
      expect(key("login/email", req("/api/v1/auth/login?email=owner@example.com", body: { password: "x" }.to_json))).to eq("owner@example.com")
      expect(key("super_login/email", req("/api/v1/super/login", body: "email=Root%40easalpha.com&password=x", type: "application/x-www-form-urlencoded"))).to eq("root@easalpha.com")
      expect(key("otp/phone", req("/api/v1/auth/otp/request", body: "phone=03001234567", type: "application/x-www-form-urlencoded"))).to eq("03001234567")
    end

    it "leaves the body for the controller and gives no key for a body it cannot read" do
      r = req("/api/v1/auth/login", body: { email: "owner@example.com" }.to_json)
      key("login/email", r)
      expect(r.body.read).to include("owner@example.com")
      expect(key("login/email", req("/api/v1/auth/login", body: "{not json"))).to be_nil
    end

    it "lets a JSON login through to the controller after reading it" do
      owner = signup_business(email: "kept@example.com", password: "password123")
      expect(owner).to be_present
      env = { "CONTENT_TYPE" => "application/json" }
      post "/api/v1/auth/login", params: { email: "kept@example.com", password: "password123" }.to_json, headers: env
      expect(response).to have_http_status(:ok), response.body
    end
  end

  describe "QR table ordering" do
    it "is counted per table, reading apart from sending, and no longer under the storefront's limit" do
      expect(key("qr/read", req("/api/v1/qr/tbl-7/orders/abc", method: "GET"))).to eq("tbl-7")
      expect(key("qr/read", req("/api/v1/qr/tbl-7/bill", method: "GET"))).to eq("tbl-7")
      expect(key("qr/read", req("/api/v1/qr/tbl-7/orders", body: "{}"))).to be_nil
      expect(key("qr/send", req("/api/v1/qr/tbl-7/orders", body: "{}"))).to eq("tbl-7")
      expect(key("qr/send", req("/api/v1/qr/tbl-7/requests", body: "{}"))).to eq("tbl-7")
      expect(key("qr/send", req("/api/v1/qr/tbl-7", method: "GET"))).to be_nil
      expect(key("qr/read", req("/api/v1/qr_orders", method: "GET"))).to be_nil
      expect(throttles.fetch("qr/read").limit).to be > 120
      expect(throttles.fetch("qr/send").limit).to be <= 30
      expect(key("public/ip", req("/api/v1/qr/tbl-7/orders/abc", method: "GET"))).to be_nil
      expect(key("public/ip", req("/api/v1/public/storefront/x/orders", body: "{}"))).to eq("203.0.113.9")
      expect(key("api/ip", req("/api/v1/qr/tbl-7/orders/abc", method: "GET"))).to eq("203.0.113.9")
    end
  end
end

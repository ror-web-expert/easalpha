class Rack::Attack
  # The email in a JSON login body, lower-cased, or nil. The body is read and rewound so the controller still gets it.
  LOGIN_EMAIL = lambda do |req|
    body = begin; JSON.parse(req.body.read); rescue; {}; ensure; req.body.rewind; end
    body["email"].to_s.strip.downcase.presence
  end

  # Local development only: the browser test runs drive many tills and screens from 127.0.0.1 at once.
  safelist("local development") { |req| Rails.env.development? && %w[127.0.0.1 ::1].include?(req.ip) }

  throttle("login/ip", limit: 20, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/auth/") && req.post? }
  # Accepting a staff invitation sends and checks codes like a login (QA of 6 Nov 2026, P1).
  throttle("invitation/ip", limit: 20, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/invitations/") && req.post? }
  # Per account as well as per address, so a password run spread over many addresses still stops at the account
  # (review of 6 Nov 2026, A10). The super admin login was outside every throttle; it gets both.
  throttle("login/email", limit: 10, period: 10.minutes) { |req| LOGIN_EMAIL.call(req) if req.path == "/api/v1/auth/login" && req.post? }
  throttle("super_login/ip", limit: 10, period: 10.minutes) { |req| req.ip if req.path == "/api/v1/super/login" && req.post? }
  throttle("super_login/email", limit: 10, period: 10.minutes) { |req| LOGIN_EMAIL.call(req) if req.path == "/api/v1/super/login" && req.post? }
  throttle("otp/phone", limit: 5, period: 10.minutes) do |req|
    if req.path == "/api/v1/auth/otp/request" && req.post?
      body = begin; JSON.parse(req.body.read); rescue; {}; ensure; req.body.rewind; end
      body["phone"].to_s.presence
    end
  end
  # A pairing code is six digits and lives 24 hours: five tries a minute per address keeps guessing hopeless.
  throttle("pair/ip", limit: 5, period: 1.minute) { |req| req.ip if req.path == "/api/v1/devices/pair" && req.post? }
  # Everything a guest reaches without a token: the storefront (under /public/) and QR table ordering (A12).
  throttle("public/ip", limit: 120, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/public/", "/api/v1/qr/") }
  throttle("api/ip", limit: 600, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/") }
  self.throttled_responder = lambda do |_req|
    [ 429, { "Content-Type" => "application/json" }, [ { error: { code: "rate_limited", message: "Too many requests" } }.to_json ] ]
  end
end
Rails.application.config.middleware.use Rack::Attack unless Rails.env.test?

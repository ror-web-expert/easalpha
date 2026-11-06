class Rack::Attack
  # A field of the request as the controller will read it: from a JSON body, a form-encoded body or the query string
  # alike (params), lower-cased, or nil. Read from the JSON body alone, a form-encoded or query-string email skipped
  # the per-account limit and still logged in (final round, sync-auth#3). Rails keeps what it parsed for the controller.
  PARAM = lambda do |req, key|
    ActionDispatch::Request.new(req.env).params[key].to_s.strip.downcase.presence
  rescue StandardError
    nil
  end
  LOGIN_EMAIL = ->(req) { PARAM.call(req, "email") }

  # A QR table's token from /api/v1/qr/:token/..., or nil for any other path.
  QR_TABLE = ->(req) { req.path[%r{\A/api/v1/qr/([^/]+)}, 1] }

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
  throttle("otp/phone", limit: 5, period: 10.minutes) { |req| PARAM.call(req, "phone") if req.path == "/api/v1/auth/otp/request" && req.post? }
  # A pairing code is six digits and lives 24 hours: five tries a minute per address keeps guessing hopeless.
  throttle("pair/ip", limit: 5, period: 1.minute) { |req| req.ip if req.path == "/api/v1/devices/pair" && req.post? }
  # The storefront, which a guest reaches without a token (A12).
  throttle("public/ip", limit: 120, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/public/") }
  # QR table ordering, per table rather than per address: the guests of a full restaurant share its Wi-Fi's one
  # address, and their phones poll the order and the bill every 10 to 15 seconds, which ran the storefront's 120 a
  # minute out and gave everyone 429 (final round, sync-auth#5). Reading (the menu, the order, the bill) has its own,
  # higher limit; sending (an order, a call for the waiter or the bill) stays tight. The address limit below still holds.
  throttle("qr/read", limit: 300, period: 1.minute) { |req| QR_TABLE.call(req) if req.get? }
  throttle("qr/send", limit: 30, period: 1.minute) { |req| QR_TABLE.call(req) unless req.get? }
  throttle("api/ip", limit: 600, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/") }
  self.throttled_responder = lambda do |_req|
    [ 429, { "Content-Type" => "application/json" }, [ { error: { code: "rate_limited", message: "Too many requests" } }.to_json ] ]
  end
end
Rails.application.config.middleware.use Rack::Attack unless Rails.env.test?

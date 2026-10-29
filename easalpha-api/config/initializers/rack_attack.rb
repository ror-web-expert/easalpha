class Rack::Attack
  throttle("login/ip", limit: 20, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/auth/") && req.post? }
  throttle("otp/phone", limit: 5, period: 10.minutes) do |req|
    if req.path == "/api/v1/auth/otp/request" && req.post?
      body = begin; JSON.parse(req.body.read); rescue; {}; ensure; req.body.rewind; end
      body["phone"].to_s.presence
    end
  end
  # A pairing code is six digits and lives 24 hours: five tries a minute per address keeps guessing hopeless.
  throttle("pair/ip", limit: 5, period: 1.minute) { |req| req.ip if req.path == "/api/v1/devices/pair" && req.post? }
  throttle("public/ip", limit: 120, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/v1/public/") }
  throttle("api/ip", limit: 600, period: 1.minute) { |req| req.ip if req.path.start_with?("/api/") }
  self.throttled_responder = lambda do |_req|
    [ 429, { "Content-Type" => "application/json" }, [ { error: { code: "rate_limited", message: "Too many requests" } }.to_json ] ]
  end
end
Rails.application.config.middleware.use Rack::Attack unless Rails.env.test?

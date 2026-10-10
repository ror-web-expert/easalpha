module RequestHelpers
  def json = JSON.parse(response.body, symbolize_names: true)

  def auth_headers(membership, app: "admin", device: nil, branch: nil)
    token = Auth::TokenService.access_token(user: membership.user, membership: membership, app: app, device: device, branch: branch)
    { "Authorization" => "Bearer #{token}", "Content-Type" => "application/json", "Accept" => "application/json" }
  end

  def device_headers(device)
    { "Authorization" => "Bearer #{Auth::TokenService.device_token(device)}", "Content-Type" => "application/json" }
  end

  def api_post(path, body = {}, headers: {})
    post path, params: body.to_json, headers: { "Content-Type" => "application/json" }.merge(headers)
  end

  def api_patch(path, body = {}, headers: {})
    patch path, params: body.to_json, headers: { "Content-Type" => "application/json" }.merge(headers)
  end

  def api_put(path, body = {}, headers: {})
    put path, params: body.to_json, headers: { "Content-Type" => "application/json" }.merge(headers)
  end

  # Signs up a fresh business and returns the owner membership (already in an unscoped test context).
  def signup_business(name: "Karachi Grill", email: nil, password: "password123")
    email ||= "owner-#{SecureRandom.hex(4)}@example.com"
    r = Auth::Signup.call(name: "Owner #{name}", business_name: name, email: email, password: password)
    r.membership.reload
  end

  def within(business, &block)
    Tenancy::Context.with(business, &block)
  end
end

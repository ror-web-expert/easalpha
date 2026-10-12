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

  # Signs up a fresh business and returns the owner membership (already in an unscoped test context). A real signup
  # starts with the customer accounts and payroll modules off; specs get them on unless they pass modules: false.
  def signup_business(name: "Karachi Grill", email: nil, password: "password123", modules: true)
    email ||= "owner-#{SecureRandom.hex(4)}@example.com"
    r = Auth::Signup.call(name: "Owner #{name}", business_name: name, email: email, password: password)
    set_modules!(r.membership.business, customer_accounts: modules, payroll: modules) if modules
    r.membership.reload
  end

  def set_modules!(business, customer_accounts: nil, payroll: nil)
    values = { "modules.customer_accounts" => customer_accounts, "modules.payroll" => payroll }.compact
    Tenancy::Context.with(business) { Setting.write!(business, values) } if values.any?
  end

  def within(business, &block)
    Tenancy::Context.with(business, &block)
  end

  # The business day a business is trading in right now (06:01 to 02:01 by default), which is what "today" means
  # everywhere in the API; the UTC calendar date differs from it for three hours every night.
  def today_for(business)
    Tenancy::Context.with(business) { Branch.order(:created_at).first.business_day_for(Time.current) }
  end
end

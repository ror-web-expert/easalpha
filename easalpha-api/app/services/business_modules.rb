# Optional parts of EasAlpha the owner switches on: customer accounts (khata) and payroll with wages. Off for a new
# business; a business that already used them had them switched on by the backfill migration. When a module is off
# its screens leave the sidebar, its endpoints answer 403 module.disabled and the POS hides its controls.
module BusinessModules
  module_function

  KEYS = { "customer_accounts" => "modules.customer_accounts", "payroll" => "modules.payroll", "canteen" => "modules.canteen" }.freeze
  LABELS = { "customer_accounts" => "Customer accounts", "payroll" => "Payroll and wages", "canteen" => "Canteen" }.freeze

  # The canteen puts every meal on the worker's account, so switching it on brings customer accounts with it.
  def on?(business, name)
    return false unless business
    return true if name.to_s == "customer_accounts" && business.setting("modules.canteen") == true
    business.setting(KEYS.fetch(name.to_s)) == true
  end

  def all(business) = KEYS.keys.index_with { |k| on?(business, k) }

  def require!(business, name)
    return if on?(business, name)
    raise Api::Errors::Forbidden.new("module.disabled", "#{LABELS.fetch(name.to_s)} is switched off. The owner can switch it on in Settings, Modules.")
  end
end

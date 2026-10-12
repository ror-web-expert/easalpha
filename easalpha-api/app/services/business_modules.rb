# Optional parts of EasAlpha the owner switches on: customer accounts (khata) and payroll with wages. Off for a new
# business; a business that already used them had them switched on by the backfill migration. When a module is off
# its screens leave the sidebar, its endpoints answer 403 module.disabled and the POS hides its controls.
module BusinessModules
  module_function

  KEYS = { "customer_accounts" => "modules.customer_accounts", "payroll" => "modules.payroll" }.freeze
  LABELS = { "customer_accounts" => "Customer accounts", "payroll" => "Payroll and wages" }.freeze

  def on?(business, name)
    return false unless business
    business.setting(KEYS.fetch(name.to_s)) == true
  end

  def all(business) = KEYS.keys.index_with { |k| on?(business, k) }

  def require!(business, name)
    return if on?(business, name)
    raise Api::Errors::Forbidden.new("module.disabled", "#{LABELS.fetch(name.to_s)} is switched off. The owner can switch it on in Settings, Modules.")
  end
end

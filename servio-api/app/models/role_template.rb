# The seven default roles, created for every new business. The owner can copy and edit them.
module RoleTemplate
  ALL_CODES = Permission.codes

  TEMPLATES = {
    "owner" => { name: "Owner", permissions: ALL_CODES, limits: {} },
    "manager" => {
      name: "Manager",
      permissions: ALL_CODES - %w[payroll.manage billing.manage settings.manage],
      limits: {}
    },
    "cashier" => {
      name: "Cashier",
      permissions: %w[app.pos orders.create orders.edit_after_send discounts.apply payments.take receipts.reprint shifts.own cash.in_out drawer.open kitchen.view menu.view customers.view customers.manage khata.collect reports.view_own expenses.manage],
      limits: { "discounts.apply" => 10 }
    },
    "waiter" => {
      name: "Waiter",
      permissions: %w[app.pos orders.create orders.edit_after_send kitchen.view menu.view customers.view],
      limits: {}
    },
    "kitchen" => {
      name: "Kitchen",
      permissions: %w[app.kitchen kitchen.view kitchen.bump stock.waste],
      limits: {}
    },
    "rider" => {
      name: "Rider",
      permissions: %w[app.rider payments.cod reports.view_own],
      limits: {}
    },
    "accountant" => {
      name: "Accountant",
      permissions: %w[app.admin reports.view_all finance.view expenses.manage audit.view customers.view],
      limits: {}
    }
  }.freeze

  def self.create_for(business)
    TEMPLATES.map do |key, t|
      role = Role.create!(business: business, name: t[:name], system_key: key, is_system: true)
      rows = t[:permissions].map do |code|
        { business_id: business.id, role_id: role.id, permission_code: code, limit_value: t[:limits][code], created_at: Time.current, updated_at: Time.current }
      end
      RolePermission.insert_all!(rows) if rows.any?
      role
    end
  end
end

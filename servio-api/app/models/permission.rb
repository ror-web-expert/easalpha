# Permission registry: the only source of valid codes.
#
# Two families live here. SPEC codes (UPPER_SNAKE, from docs/SPEC.md "The permission set") carry a module, a surface
# (software = desktop POS, app = tablet, both) and a restriction flag. EasAlpha codes (dotted) are the earlier set that
# the controllers check. Each SPEC code lists the EasAlpha codes it implies, so granting a SPEC code keeps every existing
# check working; the reverse holds when all of a SPEC code's implied EasAlpha codes are granted.
module Permission
  Entry = Struct.new(:code, :module_name, :label, :description, :surface, :restriction, :implies, keyword_init: true) do
    def spec? = code == code.upcase
    def to_h = { code: code, module: module_name, label: label, description: description, surface: surface, restriction: restriction, implies: implies, spec: spec? }
  end

  SURFACES = %w[software app both].freeze
  SERVIO_MODULE = "EasAlpha extras".freeze

  SERVIO = {
    "app.admin" => "Open the admin panel",
    "app.pos" => "Open the POS app",
    "app.kitchen" => "Open the kitchen display",
    "app.rider" => "Open the rider app",
    "orders.create" => "Take orders",
    "orders.edit_after_send" => "Edit an order after it was sent to the kitchen",
    "orders.void" => "Void an order before payment",
    "orders.refund" => "Refund after payment",
    "orders.staff_meal" => "Mark an order as staff meal or complimentary",
    "discounts.apply" => "Apply a discount up to the role limit",
    "discounts.above_limit" => "Apply a discount above the limit",
    "prices.override" => "Override an item price",
    "items.open" => "Sell an open item",
    "payments.take" => "Take payment",
    "payments.cod" => "Collect cash on delivery",
    "receipts.reprint" => "Reprint a receipt",
    "shifts.own" => "Open and close own shift",
    "shifts.any" => "Open and close any shift, approve over or short",
    "cash.in_out" => "Record cash in and out",
    "drawer.open" => "Open the cash drawer without a sale",
    "kitchen.view" => "View the kitchen display",
    "kitchen.bump" => "Bump orders on the kitchen display",
    "menu.view" => "View the menu",
    "menu.edit" => "Edit menu and prices",
    "tables.manage" => "Manage tables and floor plan",
    "customers.view" => "View customers",
    "customers.manage" => "Add and edit customers",
    "khata.collect" => "Collect khata payments",
    "staff.manage" => "Manage staff and roles",
    "devices.manage" => "Pair and revoke devices",
    "settings.manage" => "Change business settings",
    "billing.manage" => "Manage subscription and billing",
    "reports.view_all" => "View all reports",
    "reports.view_branch" => "View branch reports",
    "reports.view_own" => "View own shift or own deliveries",
    "stock.view" => "View stock",
    "stock.actions" => "Receive, transfer, adjust, count stock",
    "stock.waste" => "Record waste",
    "stock.count" => "Count stock",
    "purchasing.manage" => "Purchase orders and goods received",
    "suppliers.manage" => "Manage suppliers",
    "riders.manage" => "Manage riders and assign deliveries",
    "expenses.manage" => "Record expenses",
    "finance.view" => "View finance and accounts",
    "payroll.manage" => "Manage payroll",
    "audit.view" => "View the audit log"
  }.freeze

  # [module, code, label, description, surface, restriction, implies]
  SPEC_ROWS = [
    [ "Dashboard", "DASHBOARD", "Dashboard", "Open the POS dashboard", "both", false, %w[app.pos] ],
    [ "Dashboard", "VIEW_DAILY_SALES", "View daily sales", "See today's sales figures on the POS", "both", false, %w[reports.view_own] ],
    [ "Dashboard", "VIEW_SALES_ANALYTICS", "View sales analytics", "See sales analytics and trends on the POS", "both", false, %w[reports.view_branch] ],
    [ "Dashboard", "OFFLINE_ORDERS", "Offline orders", "See the queue of orders punched without a connection", "software", false, [] ],
    [ "Dashboard", "PRINTERS", "Printers", "Set up printers on the desktop POS", "software", false, [] ],
    [ "Dashboard", "SETTINGS", "POS settings", "Change settings on the POS", "both", false, [] ],
    [ "Take Orders", "SALES_WALKIN", "Walk-in sales", "Punch walk-in orders", "both", false, %w[orders.create] ],
    [ "Take Orders", "SALES_TAKEAWAY", "Takeaway sales", "Punch takeaway orders", "both", false, %w[orders.create] ],
    [ "Take Orders", "SALES_DELIVERY", "Delivery sales", "Punch delivery orders", "both", false, %w[orders.create] ],
    [ "Orders", "ORDERS", "Orders", "Open the orders list", "both", false, [] ],
    [ "Orders", "WEB_ORDERS", "Web orders", "See and accept orders from the website and app", "both", false, [] ],
    [ "Orders", "COMPLETE_ORDER", "Complete order", "Mark an order completed", "both", false, [] ],
    [ "Orders", "CANCEL_ORDER", "Cancel order", "Cancel an order", "both", false, %w[orders.void] ],
    [ "Orders", "REOPEN_ORDER", "Reopen order", "Reopen a completed order for editing", "both", false, %w[orders.edit_after_send] ],
    [ "Orders", "PLACE_AND_COMPLETE_ORDER", "Place and complete", "Place an order and complete it in one step", "both", false, [] ],
    [ "Orders", "COMPLIMENTARY_ORDER", "Complimentary order", "Mark an order complimentary", "both", false, %w[orders.staff_meal] ],
    [ "Editing a Reopened Order", "DELETE_ORDER_ITEM", "Delete order item", "Remove a line from a reopened order", "both", false, %w[orders.edit_after_send] ],
    [ "Editing a Reopened Order", "MODIFY_REOPEN_DECREASE_QTY", "Decrease quantity", "Lower a line quantity on a reopened order", "both", false, %w[orders.edit_after_send] ],
    [ "Payment", "PAYMENT", "Payment", "Open the payment screen", "both", false, %w[payments.take] ],
    [ "Payment", "ACCEPT_PAYMENT", "Accept payment", "Record a payment against an order", "both", false, %w[payments.take] ],
    [ "Payment", "PLACE_UNPAID_DIRECT", "Place unpaid directly", "Skip the payment screen when Direct Unpaid Orders is on; reopened orders always use it", "both", false, [] ],
    [ "Payment", "APPLY_VOUCHER", "Apply voucher", "Apply a voucher; does not count against the discount limit and works only for its customer", "both", false, %w[discounts.apply] ],
    [ "Customer Account", "CUSTOMER_ACCOUNT", "Customer account", "Settle orders to a customer account and view it", "both", false, %w[customers.view khata.collect] ],
    [ "Customer Account", "SEND_ACCOUNT_BILL", "Send account bill", "Send a customer their account statement", "both", false, [] ],
    [ "Purchase Orders", "PURCHASE_ORDERS", "Purchase orders", "Open purchase orders", "both", false, %w[stock.view] ],
    [ "Purchase Orders", "PO_CREATE", "Create PO", "Create a purchase order", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_EDIT", "Edit PO", "Edit a purchase order", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_DELETE", "Delete PO", "Delete a draft purchase order", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_RECEIVE", "Receive PO", "Receive stock against a purchase order", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_RETURN", "Return PO", "Return goods to the supplier", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_PAYMENT", "Pay PO", "Record a payment against a purchase order", "both", false, %w[purchasing.manage] ],
    [ "Purchase Orders", "PO_ADD_ITEM", "Add item inline", "Create an inventory item while building a purchase order", "both", false, %w[stock.actions] ],
    [ "Purchase Orders", "PO_ADD_SUPPLIER", "Add supplier inline", "Create a supplier while building a purchase order", "both", false, %w[suppliers.manage] ],
    [ "Suppliers", "SUPPLIERS", "Suppliers", "Open the suppliers list", "both", false, %w[suppliers.manage] ],
    [ "Suppliers", "SUPPLIER_LEDGER", "Supplier ledger", "Open the supplier ledger", "both", false, %w[suppliers.manage] ],
    [ "Suppliers", "SUPPLIER_VIEW_LEDGER", "View supplier ledger", "View a supplier's ledger entries", "both", false, [] ],
    [ "Suppliers", "SUPPLIER_RECORD_PAYMENT", "Record supplier payment", "Record a payment to a supplier", "both", false, %w[suppliers.manage] ],
    [ "Marketing", "MARKETING", "Marketing", "Open marketing", "both", false, [] ],
    [ "Marketing", "MARKETING_CAMPAIGN", "Campaigns", "Create and send campaigns", "both", false, %w[customers.manage] ],
    [ "Marketing", "MARKETING_CAMPAIGN_LOG", "Campaign log", "See the campaign log", "both", false, [] ],
    [ "Marketing", "MARKETING_CONTACTS", "Contacts", "Manage marketing contacts", "both", false, %w[customers.manage] ],
    [ "Marketing", "MARKETING_AUTO_SEND_LOG", "Auto-send log", "See the automatic send log", "both", false, [] ],
    [ "Riders", "RIDERS", "Riders", "Open riders", "both", false, [] ],
    [ "Riders", "RIDER_VIEW", "View riders", "View permanent riders", "both", false, [] ],
    [ "Riders", "RIDER_CREATE", "Create rider", "Add a permanent rider", "both", false, %w[riders.manage] ],
    [ "Riders", "RIDER_EDIT", "Edit rider", "Edit a permanent rider", "both", false, %w[riders.manage] ],
    [ "Riders", "RIDER_DELETE", "Delete rider", "Delete a permanent rider; one on past orders is deactivated instead", "both", false, %w[riders.manage] ],
    [ "Riders", "DUMMY_RIDER_VIEW", "View temporary riders", "View temporary riders", "both", false, [] ],
    [ "Riders", "DUMMY_RIDER_CREATE", "Create temporary rider", "Add a temporary rider with a lifetime", "both", false, %w[riders.manage] ],
    [ "Riders", "DUMMY_RIDER_EDIT", "Edit temporary rider", "Edit a temporary rider", "both", false, %w[riders.manage] ],
    [ "Riders", "DUMMY_RIDER_DELETE", "Delete temporary rider", "Delete a temporary rider", "both", false, %w[riders.manage] ],
    [ "Other Screens", "KDS", "Kitchen display", "Open the kitchen display; can be a user's only access", "both", false, %w[app.kitchen kitchen.view kitchen.bump] ],
    [ "Other Screens", "EXPENSES", "Expenses", "Record expenses at the till", "both", false, %w[expenses.manage] ],
    [ "Other Screens", "REPORTS", "Reports", "Open reports on the POS", "both", false, %w[reports.view_branch] ],
    [ "Other Screens", "MY_TILL", "My till", "Open the cashier's own till", "both", false, %w[shifts.own] ],
    [ "Other Screens", "PAYROLL", "Payroll", "Open payroll", "both", false, %w[payroll.manage] ],
    [ "Security", "REQUIRE_PIN_FOR_ORDER_UPDATE", "Require PIN for order update", "Restriction: demand the order-update PIN before saving a reopened order", "both", true, [] ]
  ].freeze

  MODULES = SPEC_ROWS.map(&:first).uniq.freeze
  # SPEC codes that must be granted explicitly: a role's EasAlpha codes never imply them in reverse.
  EXPLICIT_ONLY = %w[REOPEN_ORDER DELETE_ORDER_ITEM MODIFY_REOPEN_DECREASE_QTY PLACE_UNPAID_DIRECT PLACE_AND_COMPLETE_ORDER].freeze

  REGISTRY = (
    SPEC_ROWS.map { |m, code, label, desc, surface, restriction, implies| Entry.new(code: code, module_name: m, label: label, description: desc, surface: surface, restriction: restriction, implies: implies) } +
    SERVIO.map { |code, desc| Entry.new(code: code, module_name: SERVIO_MODULE, label: desc, description: desc, surface: "both", restriction: false, implies: []) }
  ).index_by(&:code).freeze

  # code => description, kept for callers that only need the pair.
  ALL = REGISTRY.transform_values(&:description).freeze

  def self.valid?(code) = REGISTRY.key?(code.to_s)
  def self.codes = REGISTRY.keys
  def self.spec_codes = SPEC_ROWS.map { |r| r[1] }
  def self.servio_codes = SERVIO.keys
  def self.restriction_codes = REGISTRY.values.select(&:restriction).map(&:code)
  # Everything a user can hold without a restriction being switched on for them.
  def self.grantable_codes = codes - restriction_codes
  def self.entry(code) = REGISTRY[code.to_s]

  # Granted codes plus the EasAlpha codes they imply. A set holding only EasAlpha codes (a role) also gets the SPEC codes
  # it fully covers, so existing roles show up ticked in the editor; a per-user set is taken as given.
  def self.expand(codes)
    set = codes.map(&:to_s).to_set
    reverse = set.none? { |c| entry(c)&.spec? }
    set.dup.each { |c| entry(c)&.implies&.each { |i| set << i } }
    if reverse
      REGISTRY.each_value do |e|
        next if set.include?(e.code) || e.implies.empty? || e.restriction || EXPLICIT_ONLY.include?(e.code)
        set << e.code if e.implies.all? { |i| set.include?(i) }
      end
    end
    set.to_a
  end

  # SPEC surface rule: a "software" code works only on the desktop POS, an "app" code only on the tablet app.
  # A nil surface (admin panel, jobs) ignores the rule.
  def self.allowed_on?(code, surface)
    return true if surface.nil?
    e = entry(code)
    e.nil? || e.surface == "both" || e.surface == surface.to_s
  end

  def self.module_counts(granted)
    granted = granted.to_set
    MODULES.map do |m|
      codes = SPEC_ROWS.select { |r| r.first == m }.map { |r| r[1] }
      { name: m, total: codes.size, granted: codes.count { |c| granted.include?(c) } }
    end
  end
end

module Settings
  # SPEC "Settings and multi-outlet": a typed key-value store per outlet with a seeded default per key and a version
  # stamp each surface compares against. Keys are grouped exactly as the SPEC settings screens.
  module Registry
    Key = Struct.new(:key, :group, :screen, :type, :default, :label, :secret, keyword_init: true) do
      def to_h(value) = { key: key, group: group, screen: screen, type: type, label: label, value: secret ? (value.present? ? "set" : nil) : value, default: secret ? nil : default }
    end

    GROUPS = {
      "store" => "Store", "point_of_sale" => "Point of Sale", "charges_tax" => "Charges & Tax", "inventory" => "Inventory", "security_cash" => "Security & Cash"
    }.freeze

    # [key, group, screen, type, default, label, secret?]
    ROWS = [
      ["store.secondary_phone", "store", "Store Profile", "string", nil, "Secondary phone printed on the receipt"],
      ["store.linked_stores", "store", "Store Management", "json", [], "Other store accounts managed from this dashboard"],
      ["whatsapp.account.master_enabled", "store", "WhatsApp", "boolean", true, "Master toggle: off disables every WhatsApp send button everywhere"],
      ["whatsapp.account.auto_send_on_payment", "store", "WhatsApp", "boolean", true, "Send the account statement automatically when a customer pays on account"],
      ["whatsapp.account.receipt_image", "store", "WhatsApp", "boolean", false, "Attach the receipt as an image"],
      ["whatsapp.account.store_logo", "store", "WhatsApp", "boolean", true, "Print the store logo on images"],
      ["notifications.low_stock", "store", "Notifications", "boolean", true, "Notify when an item falls below its minimum"],
      ["notifications.cash_short", "store", "Notifications", "boolean", true, "Notify the owner when a shift closes short"],
      ["notifications.big_void", "store", "Notifications", "boolean", true, "Notify the owner of large voids"],
      ["notifications.daily_summary", "store", "Notifications", "boolean", true, "Send the daily summary at close"],
      ["notifications.new_online_order", "store", "Notifications", "boolean", true, "Alert the POS when a website or app order arrives"],
      ["notifications.pending_customers", "store", "Notifications", "boolean", true, "Badge for online sign-ups waiting for approval"],
      ["marketing.regular_discounts.enabled", "store", "Regular Discounts", "boolean", true, "Apply recency tier discounts automatically at the till"],
      ["marketing.regular_discounts.blocked_customer_ids", "store", "Regular Discounts", "json", [], "Customers who never receive a regular discount"],

      ["pos.order_taker.print_through_desktop", "point_of_sale", "Order Taker", "boolean", true, "Tablets print through the desktop print server"],
      ["pos.customer_required.walk_in", "point_of_sale", "Customer Required", "boolean", false, "A customer must be selected on walk-in orders"],
      ["pos.customer_required.takeaway", "point_of_sale", "Customer Required", "boolean", false, "A customer must be selected on takeaway orders"],
      ["pos.customer_required.delivery", "point_of_sale", "Customer Required", "boolean", true, "A customer must be selected on delivery orders"],
      ["pos.customer_fields", "point_of_sale", "Customer Fields", "json", %w[name phone address], "Details asked for when a customer is added"],
      ["pos.order_behavior.confirmation_popup", "point_of_sale", "Order Behavior", "boolean", true, "Show a confirmation popup after each order; off means auto-redirect"],
      ["pos.order_behavior.direct_unpaid_orders", "point_of_sale", "Order Behavior", "boolean", false, "Skip the payment screen for cashiers who hold PLACE_UNPAID_DIRECT; admins always qualify; reopened orders always use it"],
      ["pos.order_behavior.default_payment_method", "point_of_sale", "Order Behavior", "string", "cash", "Method the payment screen pre-selects; reopened orders open on their original method"],
      ["pos.notifications.new_order_sound", "point_of_sale", "POS Notifications", "boolean", true, "Sound on the POS when a web or app order arrives"],
      ["pos.notifications.show_badges", "point_of_sale", "POS Notifications", "boolean", true, "Show badges for new orders and messages"],
      ["pos.kds.new_order_sound", "point_of_sale", "KDS Alerts", "boolean", false, "Sound when a new Pending order arrives, while the KDS page is open"],
      ["pos.kds.timeout_minutes", "point_of_sale", "KDS Alerts", "integer", nil, "Minutes after which a still-Pending card turns red; blank disables"],
      ["pos.kds.red_sound", "point_of_sale", "KDS Alerts", "boolean", false, "One-shot sound when a card first turns red"],
      ["pos.barcode_scanning.enabled", "point_of_sale", "Barcode Scanning", "boolean", false, "Add products by scanning a barcode on the POS"],
      ["pos.pending_reminder.enabled", "point_of_sale", "Pending Order Reminder", "boolean", true, "Badge for open orders in the POS and admin headers"],
      ["pos.pending_reminder.red_minutes_before_close", "point_of_sale", "Pending Order Reminder", "integer", 60, "Turn the badge red this many minutes before closing and warn at logout"],
      ["pos.receipt.header", "point_of_sale", "Receipt Branding", "string", "", "Text under the store name"],
      ["pos.receipt.footer", "point_of_sale", "Receipt Branding", "string", "Thank you", "Footer text"],
      ["pos.receipt.show_logo", "point_of_sale", "Receipt Branding", "boolean", true, "Print the logo at the top"],
      ["pos.receipt.footer_qr_url", "point_of_sale", "Receipt Branding", "string", nil, "QR code in the footer: a review link or menu URL"],
      ["pos.receipt.paper", "point_of_sale", "Receipt Branding", "string", "80", "Thermal paper width, 58 or 80 mm"],
      ["pos.receipt.language", "point_of_sale", "Receipt Branding", "string", "en", "Receipt language"],
      ["catalog.display.images", "point_of_sale", "Display Settings", "boolean", true, "Show product images on POS tiles and the catalog"],
      ["catalog.display.columns", "point_of_sale", "Display Settings", "integer", 4, "Tiles per row on the POS"],
      ["catalog.display.show_prices", "point_of_sale", "Display Settings", "boolean", true, "Show prices on POS tiles"],
      ["catalog.display.show_inactive", "point_of_sale", "Display Settings", "boolean", false, "Show inactive products in the admin catalog"],
      ["pos.print_server.ip", "point_of_sale", "Print Server", "string", nil, "IP address of the desktop computer every order-taker tablet prints through"],
      ["pos.print_server.port", "point_of_sale", "Print Server", "integer", 9100, "Print server port"],

      ["charges.service_charge.mode", "charges_tax", "Service Charge", "string", "percent", "percent or fixed"],
      ["charges.service_charge.value", "charges_tax", "Service Charge", "number", 0, "Pre-filled on the POS payment page; zero or blank disables"],
      ["charges.service_charge.order_types", "charges_tax", "Service Charge", "json", ["dine_in"], "Order types the default applies to"],
      ["charges.delivery_charge.mode", "charges_tax", "Delivery Charge", "string", "fixed", "percent or fixed"],
      ["charges.delivery_charge.value", "charges_tax", "Delivery Charge", "number", 0, "Pre-filled on the delivery order page; zero or blank disables; zones may override"],
      ["tax.pra.environment", "charges_tax", "PRA e-IMS", "string", "sandbox", "sandbox or production"],
      ["tax.pra.pos_id", "charges_tax", "PRA e-IMS", "string", nil, "POS ID from PRA registration"],
      ["tax.pra.access_code", "charges_tax", "PRA e-IMS", "string", nil, "Access code from PRA registration", true],
      ["tax.pra.bearer_token", "charges_tax", "PRA e-IMS", "string", nil, "Bearer token held server-side, used only by the cashier app", true],
      ["tax.pra.counter_name", "charges_tax", "PRA e-IMS", "string", nil, "Counter name"],
      ["tax.pra.branch_name", "charges_tax", "PRA e-IMS", "string", nil, "Branch name"],
      ["tax.rate_cash_percent", "charges_tax", "PRA e-IMS", "number", 16, "Tax rate on cash payments"],
      ["tax.rate_card_percent", "charges_tax", "PRA e-IMS", "number", 5, "Reduced tax rate on card payments"],

      ["inventory.stock_alerts.low_stock", "inventory", "Stock Alerts", "boolean", true, "Alert when an item reaches its minimum"],
      ["inventory.stock_alerts.negative", "inventory", "Stock Alerts", "boolean", true, "Alert when an item goes below zero"],

      ["security.expense_report_pin", "security_cash", "Expense & Report PIN", "pin", nil, "PIN asked before expenses and reports open on the POS", true],
      ["security.cashier_pin_required", "security_cash", "Cashier PIN", "boolean", true, "Cashier actions need the cashier's own PIN"],
      ["security.cashier_drawer", "security_cash", "Cashier Drawer", "boolean", true, "Payments land in each cashier's own till account instead of the admin accounts"],

      # Servio extras that already lived in businesses.settings, kept under their old keys.
      ["cash_rounding", "charges_tax", "Service Charge", "integer", 0, "Round cash to Rs 5 or Rs 10"],
      ["staff_meal_requires_approval", "point_of_sale", "Order Behavior", "boolean", true, "A staff meal needs a manager PIN"],
      ["discount_requires_reason", "point_of_sale", "Order Behavior", "boolean", true, "A discount needs a reason"],
      ["kitchen_ticket_print", "point_of_sale", "KDS Alerts", "boolean", true, "Print kitchen tickets as well as showing the KDS"],
      ["default_order_type", "point_of_sale", "Order Behavior", "string", "walk_in", "Order type the POS opens on"],
      ["big_void_alert_minor", "security_cash", "Cashier PIN", "integer", 500_000, "WhatsApp the owner when a void is above this amount, in paisa"],
      ["cash_short_alert_minor", "security_cash", "Cashier Drawer", "integer", 100_000, "WhatsApp the owner when a till is short by more than this, in paisa"]
    ].freeze

    KEYS = ROWS.map { |k, g, s, t, d, l, secret = false| Key.new(key: k, group: g, screen: s, type: t, default: d, label: l, secret: secret) }.index_by(&:key).freeze

    # Legacy keys whose value is also mirrored to the old jsonb name, so earlier readers keep working.
    MIRRORS = {
      "charges.service_charge.value" => "service_charge_percent", "charges.service_charge.order_types" => "service_charge_order_types"
    }.freeze

    def self.key(k) = KEYS[k.to_s]
    def self.valid?(k) = KEYS.key?(k.to_s)
    def self.keys = KEYS.keys

    def self.cast(key, value)
      k = key(key) or raise ArgumentError, "unknown setting: #{key}"
      return nil if value.nil? || (value == "" && k.type != "string")
      case k.type
      when "boolean" then ActiveModel::Type::Boolean.new.cast(value)
      when "integer" then Integer(value)
      when "number" then Float(value)
      when "pin"
        raise ArgumentError, "#{key} must be 4 digits" unless value.to_s.match?(/\A\d{4}\z/)
        BCrypt::Password.create(value.to_s)
      when "json" then value.is_a?(String) ? JSON.parse(value) : value
      else value.to_s
      end
    end
  end
end

module Sync
  # Everything a till needs that changed since its cursor. PIN digests never leave the server (a four-digit PIN behind
  # bcrypt is still ten thousand guesses on a stolen till); secret settings neither (Setting.without_secrets).
  module Changes
    module_function

    def call(branch:, since: nil, device: nil)
      now = Time.current
      changed = ->(scope) { since ? scope.where("#{scope.table_name}.updated_at > ?", since) : scope }
      {
        cursor: now.iso8601(6), since: since&.iso8601(6),
        business: Serializers.business(Current.business),
        branch: Serializers.branch(branch),
        menus: changed.call(Menu.all).map { |m| MenuSerializers.menu(m) },
        categories: changed.call(Category.all).map { |c| MenuSerializers.category(c) },
        products: changed.call(Product.all).includes(:variants, :product_prices, :product_modifier_groups, :barcodes).map { |p| MenuSerializers.product(p, full: true) },
        modifier_groups: changed.call(ModifierGroup.all).includes(:modifiers).map { |g| MenuSerializers.modifier_group(g) },
        deals: changed.call(Deal.all).includes(:deal_items).map { |d| MenuSerializers.deal(d) },
        promotions: changed.call(Promotion.all).map { |p| MenuSerializers.promotion(p) },
        quick_add_items: QuickAddItem.ordered.includes(:product, :variant).map { |q| MenuSerializers.quick_add_item(q) },
        tax_rates: changed.call(TaxRate.all).map { |t| MenuSerializers.tax_rate(t) },
        stations: changed.call(Station.where(branch_id: branch.id)).map { |s| MenuSerializers.station(s) },
        payment_methods: changed.call(PaymentMethod.all).map { |m| PaymentSerializers.payment_method(m) },
        floors: changed.call(Floor.where(branch_id: branch.id)).map { |f| CustomerSerializers.floor(f) },
        tables: changed.call(DiningTable.where(branch_id: branch.id)).map { |t| CustomerSerializers.table(t) },
        customers: changed.call(Customer.where(archived_at: nil)).order(updated_at: :desc).limit(2000).map { |c| CustomerSerializers.customer(c) },
        # Archived customers since the cursor, so the till drops them from its offline search.
        archived_customer_ids: since ? Customer.where.not(archived_at: nil).where("customers.updated_at > ?", since).pluck(:id) : [],
        # The whole (short) list every time, like quick_add_items: the till replaces its copy.
        regular_discount_tiers: RegularDiscountTier.active.order(:within_days).map { |t| MarketingSerializers.tier(t) },
        staff: staff_payload(branch, device, since),
        settings: Setting.for_clients(Current.business, branch: branch), settings_version: Current.business.settings_version, day_locked: DayClose.locked?(branch.id, branch.business_day_for(now))
      }
    end

    def staff_payload(branch, device, since)
      scope = Membership.includes(:role, :user).where(status: %w[active deactivated])
      scope = scope.where("memberships.updated_at > ?", since) if since
      scope.select { |m| m.branch_allowed?(branch.id) }.map do |m|
        h = { id: m.id, user_id: m.user_id, name: m.user.name, role: m.role.name, role_key: m.role.system_key, status: m.status, permissions: m.permission_codes,
              limits: m.role.role_permissions.where.not(limit_value: nil).pluck(:permission_code, :limit_value).to_h, pin_locked: m.pin_locked?, updated_at: m.updated_at }
        h
      end
    end
  end
end

require "active_support/testing/time_helpers"

module Demo
  # Rich, idempotent demo history for a business: a month of orders, payments, stock, purchasing, expenses, people and
  # finance so every dashboard, report and screenshot looks like a busy restaurant. Everything goes through the same
  # services the API uses; the clock is moved with travel_to so each service dates its own rows (business days, journal,
  # ledger, hourly charts) consistently. Runs once per business: a marker in the business settings skips a second run.
  class RichSeed
    include ActiveSupport::Testing::TimeHelpers

    MARKER = "demo.rich_seeded_at".freeze

    Result = Struct.new(:skipped, :counts, keyword_init: true)

    # Every tenanted row reloads its Business (and Branch) for the belongs_to presence check when it is saved, which is a
    # fifth of all queries in a seed run. While a seed runs, rows of the seeded business get the cached objects instead.
    class << self
      attr_accessor :tenant_cache
    end

    module TenantBusinessCache
      def business
        cached = Demo::RichSeed.tenant_cache
        assoc = association(:business)
        assoc.target = cached[:business] if cached && !assoc.loaded? && business_id == cached[:business].id
        super
      end
    end

    module TenantBranchCache
      def branch
        cached = Demo::RichSeed.tenant_cache
        assoc = association(:branch)
        assoc.target = cached[:branch] if cached && !assoc.loaded? && branch_id == cached[:branch].id
        super
      end
    end

    def self.install_tenant_cache!
      return if @tenant_cache_installed
      Rails.application.eager_load! unless Rails.application.config.eager_load
      ApplicationRecord.descendants.select { |k| k.include?(Tenanted) }.each do |klass|
        klass.prepend(TenantBusinessCache)
        klass.prepend(TenantBranchCache) if klass.reflect_on_association(:branch)&.belongs_to?
      end
      @tenant_cache_installed = true
    end

    def self.run!(business_slug: "demo-cafe", days: 30, seed: 2026, log: nil)
      business = Business.find_by!(slug: business_slug)
      new(business, days: days, seed: seed, log: log).run!
    end

    def initialize(business, days: 30, seed: 2026, log: nil)
      @business = business
      @days = [ days.to_i, 1 ].max
      @rng = Random.new(seed)
      @log = log
      @stats = Hash.new(0)
    end

    def run!
      return Result.new(skipped: true, counts: counts) if seeded?
      owner = Tenancy::Context.with(@business) { Membership.active.joins(:role).find_by(roles: { system_key: "owner" }) || Membership.joins(:role).find_by!(roles: { system_key: "owner" }) }
      @branch = Tenancy::Context.with(@business) { Branch.active.order(is_main: :desc, created_at: :asc).first }
      self.class.install_tenant_cache!
      self.class.tenant_cache = { business: @business, branch: @branch }
      log_level, ar_logger = Rails.logger.level, ActiveRecord::Base.logger
      Tenancy::Context.with(@business, branch: @branch, user: owner.user, membership: owner) do
        @owner = owner
        @tz = ActiveSupport::TimeZone[@branch.time_zone]
        @real_now = Time.current
        @today = @branch.business_day_for(@real_now)
        @start_day = @today - (@days - 1)
        begin
          Rails.logger.level = Logger::WARN # a seed run writes a few hundred thousand queries; keep them out of the log
          ActiveRecord::Base.logger = nil
          setup_people!
          setup_devices_and_tables!
          setup_settings!
          setup_menu!
          setup_customers!
          setup_marketing!
          setup_zones_and_riders!
          setup_inventory!
          setup_employees!
          setup_attendance!
          seed_timeline!
          seed_reviews!
          tune_minimums!
          mark_seeded!
        ensure
          travel_back
          Rails.logger.level = log_level
          ActiveRecord::Base.logger = ar_logger
          self.class.tenant_cache = nil
        end
      end
      Result.new(skipped: false, counts: counts)
    end

    def counts
      Tenancy::Context.with(@business) do
        branch = Branch.order(:created_at).first
        {
          orders: Order.count, orders_by_status: Order.group(:status).count, open_orders_today: Order.open.where(business_day: branch.business_day_for(Time.current)).where.not(status: "draft").count,
          payments: Payment.where(status: "captured").count, payments_by_method: Payment.where(status: "captured").group(:method_code).sum(:amount_minor),
          revenue_minor: Order.where(status: %w[paid closed refunded]).sum(:total_minor), voids: Void.count, refunds: Refund.count, staff_meals: Order.where(is_staff_meal: true).count,
          discounts: DiscountApplied.count, vouchers_issued: Voucher.count, vouchers_redeemed: Voucher.where(status: "redeemed").count,
          customers: Customer.active.where(is_walk_in: false).count, khata_outstanding_minor: Customer.where("balance_minor > 0").sum(:balance_minor), reviews: Review.count, loyalty_points: Customer.sum(:loyalty_points),
          stock_items: StockItem.active.count, low_stock_items: StockItem.active.where("minimum_qty > 0").select(&:below_minimum?).size, recipes: Recipe.active.count, stock_documents: StockDocument.group(:kind).count,
          suppliers: Supplier.active.count, goods_receipts: GoodsReceipt.count, purchase_orders: PurchaseOrder.count, supplier_payments: SupplierPayment.count,
          expenses: Expense.live.count, expenses_minor: Expense.live.sum(:amount_minor), employees: Employee.active.count, attendance_rows: Attendance.count, payroll_runs: PayrollRun.where.not(status: "cancelled").count,
          riders: Rider.count, deliveries: Delivery.count, rider_cash_movements: RiderCashMovement.count, shifts: Shift.count, journal_entries: JournalEntry.count, deduction_audits: DeductionAudit.count
        }
      end
    end

    private

    # ---------------------------------------------------------------- helpers

    def seeded? = @business.reload.settings[MARKER].present?

    def mark_seeded!
      travel_back
      @business.reload
      @business.update!(settings: @business.settings.merge(MARKER => Time.current.iso8601))
    end

    def log(msg)
      @log&.call(msg)
    end

    def rand_i(range) = @rng.rand(range)
    def chance(p) = @rng.rand < p
    def pick(list) = list[@rng.rand(list.size)]

    def weighted(pairs)
      total = pairs.sum { |_, w| w }
      roll = @rng.rand * total
      pairs.each { |item, w| return item if (roll -= w) <= 0 }
      pairs.last.first
    end

    # A local instant on a business day; hours before the day end (0..2) fall on the next calendar date.
    def at(day, hour, minute = 0)
      date = hour < @branch.day_end_time.hour || (hour == @branch.day_end_time.hour && minute < @branch.day_end_time.min) ? day + 1 : day
      @tz.local(date.year, date.month, date.day, hour, minute)
    end

    def go(time)
      travel_to(time)
      time
    end

    def go_forward(seconds)
      go(Time.current + seconds)
    end

    def minor(rupees) = (rupees * 100).round

    # Where in the period a fraction lands; several schedule points collapse on short periods.
    def day_at(fraction)
      @start_day + [ ((@days - 1) * fraction).round, @days - 1 ].min
    end

    # ---------------------------------------------------------------- people, devices, settings

    def setup_people!
      @manager = member_for("manager", "Demo Manager") || create_member!("manager", "Demo Manager", "9999")
      @cashier = member_for("cashier", "Demo Cashier") || create_member!("cashier", "Demo Cashier", "1111")
    end

    def member_for(role_key, preferred_name)
      scope = Membership.active.joins(:role, :user).where(roles: { system_key: role_key })
      scope.find_by(users: { name: preferred_name }) || scope.order(:created_at).first
    end

    def create_member!(role_key, name, pin)
      user = User.create!(name: name, email: "#{@business.slug}-#{role_key}@easalpha.com", password: "password123")
      m = Membership.create!(user: user, role: Role.find_by!(system_key: role_key), status: "active")
      m.set_pin!(pin)
      m
    end

    def setup_devices_and_tables!
      @till = Device.where(branch_id: @branch.id, kind: "till").order(:created_at).first || Device.create!(branch: @branch, name: "Counter till", kind: "till")
      if DiningTable.active.where(branch_id: @branch.id).count < 4
        4.times { |i| DiningTable.find_or_create_by!(branch: @branch, code: "T#{i + 1}") { |t| t.seats = 4; t.location = "Hall" } }
      end
      @tables = DiningTable.active.where(branch_id: @branch.id).order(:code).to_a
    end

    def setup_settings!
      settings = @business.settings.dup
      settings["loyalty_enabled"] = true unless settings.key?("loyalty_enabled")
      settings["loyalty_rupees_per_point"] ||= 100
      @business.update!(settings: settings) if settings != @business.settings
      Setting.write!(@business, { "charges.service_charge.value" => 5 }) if @business.setting("charges.service_charge.value").to_d.zero?
      Setting.write!(@business, { "marketing.regular_discounts.enabled" => true }) unless Marketing::RegularDiscounts.enabled?(@business)
      ExpenseCategory.seed_defaults!
      Unit.seed_defaults!
      StockSection.ensure_system!(@branch)
      InventorySetting.current.update!(deduct_stock_on_sale: true) unless InventorySetting.current.deduct_stock_on_sale
    end

    # ---------------------------------------------------------------- menu

    PRODUCT_WEIGHTS = {
      "Chicken Karahi (full)" => 2, "Chicken Karahi (half)" => 3, "Chicken Biryani" => 8, "Plain Rice" => 3, "Chai" => 10, "Cold Drink 345ml" => 8, "Mineral Water 500ml" => 5,
      "Chicken Tikka" => 5, "Malai Boti (6 pcs)" => 4, "Seekh Kabab (4 pcs)" => 5, "Beef Burger" => 4, "Chicken Patty Burger" => 4, "Zinger Burger" => 6
    }.freeze

    def setup_menu!
      @products = Product.active.includes(:product_prices, :variants, :tax_rate, :category, product_modifier_groups: { modifier_group: :modifiers }).to_a
      raise "The business has no active products; seed the menu first" if @products.empty?
      @product_weights = @products.map { |p| [ p, PRODUCT_WEIGHTS.fetch(p.name, 1) ] }
      @drinks = @products.select { |p| p.category.name.to_s.downcase.include?("drink") || p.name.match?(/chai|drink|water/i) }
      @mains = @products - @drinks
    end

    def random_lines
      n = weighted([ [ 1, 3 ], [ 2, 4 ], [ 3, 2 ], [ 4, 1 ] ])
      lines = []
      n.times do |i|
        product = i.zero? && @mains.any? ? weighted(@product_weights.select { |p, _| @mains.include?(p) }) : weighted(@product_weights)
        next if lines.any? { |l| l[:product_id] == product.id }
        line = { product_id: product.id, quantity: chance(0.2) ? 2 : 1 }
        variant = product.variants.first
        line[:variant_id] = variant.id if variant && chance(0.3)
        group = product.product_modifier_groups.first&.modifier_group
        if group && group.modifiers.any? && chance(0.6)
          line[:modifiers] = [ { modifier_id: pick(group.modifiers.to_a).id } ]
        end
        line[:notes] = pick([ "Less oil", "Extra raita", "No onions", "Well done" ]) if chance(0.08)
        lines << line
      end
      lines
    end

    # ---------------------------------------------------------------- customers and marketing

    FIRST_NAMES = %w[Ahmed Ali Hassan Usman Bilal Imran Kamran Faisal Saad Hamza Zain Umar Asad Tariq Waqas Fahad Junaid Noman Shahid Rizwan Ayesha Fatima Sana Hira Maryam Zainab Amna Rabia Khadija Nida Sadia Mehwish Iqra Farah Bushra].freeze
    LAST_NAMES = %w[Khan Malik Sheikh Butt Chaudhry Raza Siddiqui Qureshi Baig Ansari Hussain Mirza Javed Akhtar Rehman Iqbal Mehmood Farooq Abbasi Awan].freeze
    AREAS = [ [ "Gulberg III", "Lahore" ], [ "DHA Phase 5", "Lahore" ], [ "Johar Town", "Lahore" ], [ "Model Town", "Lahore" ], [ "Garden Town", "Lahore" ], [ "Wapda Town", "Lahore" ] ].freeze

    def setup_customers!
      groups = %w[Regular VIP Corporate Family].map { |g| CustomerGroup.active.find_by(name: g) || CustomerGroup.create!(name: g) }
      names = []
      FIRST_NAMES.each_with_index { |f, i| names << "#{f} #{LAST_NAMES[(i * 7 + 3) % LAST_NAMES.size]}" }
      names += [ "Omar Farooq", "Hina Baig", "Danish Qureshi", "Rukhsana Ansari", "Shoaib Akhtar" ]
      @customers = names.first(40).each_with_index.map do |name, i|
        phone = "+92300#{(1_700_000 + i * 3_571).to_s.rjust(7, '0')}"
        c = Customer.active.find_by(phone: phone) || Customer.create!(name: name, phone: phone, group: groups[i % groups.size], source: pick(%w[in_store in_store phone online]),
                                                                      whatsapp_opt_in: i.even?, opt_in_at: i.even? ? Time.current : nil, birthday: Date.new(1980 + (i * 13) % 25, 1 + (i * 5) % 12, 1 + (i * 7) % 27),
                                                                      company: i % 4 == 2 ? pick([ "Nexon Traders", "Al-Falah Textiles", "Bright Tech", "Sahil Pharma" ]) : nil,
                                                                      credit_limit_minor: i % 5 == 0 ? minor([ 20_000, 30_000, 50_000 ][i % 3]) : nil, notes: i % 9 == 0 ? "Prefers window table" : nil)
        if i % 3 == 0 && c.addresses.empty?
          area, city = AREAS[i % AREAS.size]
          CustomerAddress.create!(customer: c, label: "Home", line1: "House #{10 + i * 3}, Street #{1 + i % 12}", area: area, city: city, is_default: true)
        end
        c
      end
      @credit_customers = @customers.select { |c| c.credit_limit_minor.present? }
      @delivery_customers = @customers.select { |c| c.addresses.any? }
    end

    def setup_marketing!
      RegularDiscountTier.active.find_by(name: "Back within 3 days") || RegularDiscountTier.create!(name: "Back within 3 days", within_days: 3, kind: "percent", value: 10, min_order_minor: minor(500))
      RegularDiscountTier.active.find_by(name: "Back within a week") || RegularDiscountTier.create!(name: "Back within a week", within_days: 7, kind: "percent", value: 5, min_order_minor: minor(500))
      batch = VoucherBatch.active.find_by(name: "Eid Mubarak Rs 200") ||
              Marketing::Vouchers.create_batch!({ name: "Eid Mubarak Rs 200", kind: "personal", value_kind: "fixed", value: 200, min_spend_minor: minor(1_000), expires_on: @today + 60 }, actor: @owner)
      Marketing::Vouchers.issue!(batch, customer_ids: @customers.each_with_index.select { |_, i| i % 3 == 1 }.map { |c, _| c.id }, send: false) if batch.issued_count.zero?
      @voucher_batch = batch
    end

    # ---------------------------------------------------------------- delivery zones and riders

    def setup_zones_and_riders!
      [ [ "Gulberg", %w[Gulberg], 100 ], [ "DHA", [ "DHA" ], 150 ], [ "Johar Town", [ "Johar Town", "Wapda Town" ], 120 ], [ "Model Town", [ "Model Town", "Garden Town" ], 100 ] ].each do |name, areas, charge|
        DeliveryZone.active.find_by(branch_id: @branch.id, name: name) || DeliveryZone.create!(branch: @branch, name: name, areas: areas, charge_minor: minor(charge), min_order_minor: minor(500), eta_minutes: 35)
      end
      @rider = Rider.active.permanent.find_by(name: "Kashif Raza") || Rider.create!(branch: @branch, name: "Kashif Raza", phone: "+923211234567", vehicle: "Honda CD70", vehicle_no: "LEB-4521", charge_per_delivery_minor: minor(60), address: "Ichhra, Lahore")
    end

    def zone_charge_for(address)
      zone = DeliveryZone.for_address(branch_id: @branch.id, text: [ address.area, address.city, address.line1 ].compact.join(" "))
      zone&.charge_minor || minor(100)
    end

    # ---------------------------------------------------------------- inventory

    # sku, name, category, base unit, purchase unit, cost per purchase unit (Rs), opening qty (purchase units), packaging?
    STOCK_ITEMS = [
      [ "CHK", "Chicken", "Meat", "g", "kg", 640, 120 ], [ "BEEF", "Beef boneless", "Meat", "g", "kg", 1_400, 40 ], [ "PAT", "Chicken patty", "Frozen", "pcs", nil, 85, 100 ],
      [ "RICE", "Basmati rice", "Grocery", "g", "kg", 320, 70 ], [ "OIL", "Cooking oil", "Grocery", "ml", "l", 480, 30 ], [ "SUG", "Sugar", "Grocery", "g", "kg", 160, 10 ],
      [ "TEA", "Tea leaves", "Grocery", "g", "kg", 1_500, 4 ], [ "KET", "Ketchup", "Grocery", "g", "kg", 350, 5 ], [ "MAY", "Mayonnaise", "Grocery", "g", "kg", 600, 5 ],
      [ "ONN", "Onion", "Vegetables", "g", "kg", 90, 30 ], [ "TOM", "Tomato", "Vegetables", "g", "kg", 120, 40 ], [ "GNG", "Ginger garlic paste", "Vegetables", "g", "kg", 400, 8 ], [ "LET", "Lettuce", "Vegetables", "g", "kg", 250, 5 ],
      [ "SPC", "Garam masala mix", "Spices", "g", "kg", 1_800, 10 ], [ "SALT", "Salt", "Spices", "g", "kg", 40, 10 ], [ "CHL", "Red chilli powder", "Spices", "g", "kg", 900, 5 ],
      [ "MLK", "Milk", "Dairy", "ml", "l", 220, 20 ], [ "YOG", "Yogurt", "Dairy", "g", "kg", 240, 25 ], [ "CHS", "Cheese slices", "Dairy", "g", "kg", 1_600, 5 ],
      [ "BUN", "Burger bun", "Bakery", "pcs", nil, 25, 200 ], [ "COLA", "Cold drink 345ml", "Drinks", "pcs", nil, 55, 200 ], [ "WTR", "Mineral water 500ml", "Drinks", "pcs", nil, 30, 100 ],
      [ "COAL", "Charcoal", "Fuel", "g", "kg", 120, 30 ], [ "BOX", "Takeaway box", "Packaging", "pcs", nil, 15, 200, true ], [ "BAG", "Carry bag", "Packaging", "pcs", nil, 6, 300, true ]
    ].freeze

    # Recipes in base units (g, ml, pcs) per portion.
    RECIPES = {
      "Chicken Karahi (full)" => { "CHK" => 1000, "TOM" => 400, "ONN" => 150, "GNG" => 50, "OIL" => 150, "SPC" => 30, "CHL" => 10 },
      "Chicken Karahi (half)" => { "CHK" => 500, "TOM" => 200, "ONN" => 80, "GNG" => 25, "OIL" => 80, "SPC" => 15 },
      "Chicken Biryani" => { "CHK" => 180, "RICE" => 200, "ONN" => 60, "YOG" => 40, "OIL" => 30 },
      "Plain Rice" => { "RICE" => 200, "OIL" => 10, "SALT" => 3 },
      "Chai" => { "TEA" => 8, "MLK" => 120, "SUG" => 15 },
      "Cold Drink 345ml" => { "COLA" => 1 }, "Mineral Water 500ml" => { "WTR" => 1 },
      "Chicken Tikka" => { "CHK" => 300, "YOG" => 40, "SPC" => 10, "COAL" => 100 },
      "Malai Boti (6 pcs)" => { "CHK" => 250, "YOG" => 50, "CHS" => 20, "SPC" => 8, "COAL" => 80 },
      "Seekh Kabab (4 pcs)" => { "BEEF" => 240, "ONN" => 40, "SPC" => 10, "COAL" => 80 },
      "Beef Burger" => { "BEEF" => 150, "BUN" => 1, "CHS" => 20, "LET" => 20, "KET" => 15 },
      "Chicken Patty Burger" => { "PAT" => 1, "BUN" => 1, "LET" => 15, "MAY" => 10 },
      "Zinger Burger" => { "CHK" => 150, "BUN" => 1, "OIL" => 30, "MAY" => 15 }
    }.freeze

    def unit(code) = (@units ||= Unit.active.index_by(&:code))[code]

    def setup_inventory!
      @items = {}
      STOCK_ITEMS.each do |sku, name, category, base, purchase, _cost, _opening, packaging|
        @items[sku] = StockItem.active.find_by(sku: sku) || StockItem.create!(name: name, sku: sku, category: category, base_unit: unit(base), purchase_unit: purchase && unit(purchase), is_packaging: packaging || false)
      end
      @kitchen = StockSection.default_for(@branch)
      @warehouse = StockSection.active.find_by(branch_id: @branch.id, slug: "warehouse") || @kitchen
      RECIPES.each do |product_name, lines|
        product = @products.find { |p| p.name == product_name } or next
        next if Recipe.active.exists?(product_id: product.id, variant_id: nil)
        r = Recipe.create!(product: product, name: product.name, yield_qty: 1)
        lines.each_with_index { |(sku, qty), i| r.lines.create!(stock_item: @items[sku], unit: @items[sku].base_unit, quantity: qty, waste_percent: sku == "CHK" ? 5 : 0, sort_order: i) }
      end
      %w[takeaway delivery].each do |ot|
        PackagingRule.find_or_create_by!(order_type: ot, stock_item: @items["BOX"]) { |x| x.quantity = 1 }
        PackagingRule.find_or_create_by!(order_type: ot, stock_item: @items["BAG"]) { |x| x.quantity = 1 }
      end
      @suppliers = {
        poultry: supplier!("Al-Madina Poultry", "Rafiq", "+923004561234", 7), metro: supplier!("Metro Cash & Carry", "Imran", "+923001234567", 15),
        bakery: supplier!("Gourmet Bakers", "Sana", "+923217654321", 7), grocer: supplier!("Shan Spices & Grocery", "Javed", "+923335558899", 10)
      }
      Recipes::Costing.recompute_all!
    end

    def supplier!(name, contact, phone, terms)
      Supplier.active.find_by(name: name) || Supplier.create!(name: name, contact_name: contact, phone: phone, payment_terms_days: terms)
    end

    def opening_stock!(day)
      go(at(day, 9, 30))
      lines = STOCK_ITEMS.map do |sku, _name, _cat, base, purchase, cost, opening, _pk|
        { stock_item_id: @items[sku].id, unit_id: unit(purchase || base).id, quantity: opening, unit_cost_minor: minor(cost) }
      end
      doc = Stock::Posting.create!({ kind: "opening_balance", to_section_id: @kitchen.id, note: "Opening stock for the demo month" }, lines: lines, actor: @owner, branch: @branch)
      Stock::Posting.post!(doc, actor: @owner)
      @stats[:stock_documents] += 1
    end

    # supplier key, [[sku, qty (purchase units), price factor]], pay fraction, method
    RECEIPTS = [
      [ 0.04, :poultry, [ [ "CHK", 80, 0.97 ] ], 0.6, "cash" ],
      [ 0.14, :bakery, [ [ "BUN", 150, 1.0 ], [ "BAG", 200, 1.0 ] ], 1.0, "cash" ],
      [ 0.28, :poultry, [ [ "CHK", 80, 1.0 ], [ "BEEF", 20, 1.0 ] ], 0.5, "bank" ],
      [ 0.42, :bakery, [ [ "BUN", 150, 1.04 ], [ "BOX", 200, 1.0 ] ], 1.0, "cash" ],
      [ 0.5, :grocer, [ [ "ONN", 20, 1.1 ], [ "TOM", 20, 0.95 ], [ "YOG", 8, 1.0 ], [ "LET", 3, 1.0 ], [ "GNG", 5, 1.0 ], [ "SPC", 5, 1.0 ], [ "COAL", 20, 1.0 ], [ "MLK", 20, 1.0 ], [ "TEA", 2, 1.0 ] ], 0.0, nil ],
      [ 0.56, :poultry, [ [ "CHK", 80, 1.03 ], [ "BEEF", 20, 1.02 ], [ "PAT", 100, 1.0 ] ], 0.6, "cash" ],
      [ 0.72, :bakery, [ [ "BUN", 150, 1.04 ], [ "BAG", 200, 1.08 ] ], 1.0, "easypaisa" ],
      [ 0.86, :grocer, [ [ "ONN", 20, 1.25 ], [ "TOM", 20, 1.3 ], [ "YOG", 8, 1.0 ], [ "LET", 3, 1.1 ], [ "CHS", 3, 1.0 ], [ "COAL", 20, 1.05 ], [ "MLK", 20, 1.05 ], [ "TEA", 2, 1.06 ] ], 0.4, "bank" ],
      [ 0.93, :poultry, [ [ "CHK", 80, 1.02 ], [ "BEEF", 20, 1.02 ] ], 0.0, nil ]
    ].freeze

    PURCHASE_ORDERS = [
      [ 0.22, :metro, [ [ "RICE", 30, 1.0 ], [ "OIL", 20, 1.0 ], [ "SUG", 5, 1.0 ], [ "COLA", 120, 1.0 ], [ "WTR", 96, 1.0 ], [ "KET", 3, 1.0 ], [ "MAY", 3, 1.0 ], [ "MLK", 10, 1.0 ] ], :full, 0.5 ],
      [ 0.68, :metro, [ [ "RICE", 30, 1.06 ], [ "COLA", 120, 1.05 ], [ "WTR", 96, 1.0 ], [ "PAT", 72, 1.0 ], [ "BOX", 200, 1.0 ], [ "MLK", 10, 1.1 ] ], :partial, 0.3 ]
    ].freeze

    def cost_for(sku, factor)
      row = STOCK_ITEMS.find { |r| r[0] == sku }
      minor((row[5] * factor).round)
    end

    def purchase_lines(items)
      items.map do |sku, qty, factor|
        item = @items[sku]
        { stock_item_id: item.id, unit_id: (item.purchase_unit || item.base_unit).id, quantity: qty, unit_cost_minor: cost_for(sku, factor) }
      end
    end

    def receipts_for_day!(day)
      RECEIPTS.each_with_index do |(fraction, supplier_key, items, pay_fraction, method), i|
        next unless day_at(fraction) == day
        go(at(day, 9, (10 + i * 7) % 60))
        supplier = @suppliers[supplier_key]
        grn = Purchasing::Receipts.create!({ supplier_id: supplier.id, invoice_ref: "#{supplier.name[0, 2].upcase}-#{1040 + i * 17}", received_on: day.to_s }, lines: purchase_lines(items), actor: @manager, branch: @branch, section: @kitchen)
        @stats[:goods_receipts] += 1
        next unless pay_fraction.positive? && method
        go_forward(20.minutes)
        Purchasing::Payments.record!(supplier, amount_minor: (grn.total_minor * pay_fraction).round, method_code: method, actor: @manager, branch: @branch, goods_receipt_id: grn.id, reference: method == "cash" ? nil : "PAY-#{2200 + i}",
                                     note: pay_fraction >= 1 ? "Paid in full on delivery" : "Part payment, balance on terms")
      end
      PURCHASE_ORDERS.each_with_index do |(fraction, supplier_key, items, receive, pay_fraction), i|
        next unless day_at(fraction) == day
        supplier = @suppliers[supplier_key]
        go(at(day - 1, 16, 0)) if day > @start_day
        po = Purchasing::Orders.create!({ supplier_id: supplier.id, expected_on: day, note: i.zero? ? "Fortnightly grocery order" : "Restock before the weekend" }, lines: purchase_lines(items), actor: @manager, branch: @branch)
        Purchasing::Orders.send!(po)
        go(at(day, 11, 15))
        if receive == :full
          Purchasing::Orders.receive!(po, actor: @manager, branch: @branch, section: @kitchen, invoice_ref: "MCC-#{88_120 + i}", received_on: day)
        else
          first = po.lines.first(3)
          Purchasing::Orders.receive!(po, actor: @manager, branch: @branch, section: @kitchen, invoice_ref: "MCC-#{88_120 + i}", received_on: day,
                                      lines: first.map { |l| { purchase_order_line_id: l.id, quantity: l.quantity, unit_cost_minor: l.unit_cost_minor } })
        end
        @stats[:goods_receipts] += 1
        go_forward(45.minutes)
        Purchasing::Payments.record!(supplier, amount_minor: (po.reload.total_minor * pay_fraction).round, method_code: "bank", actor: @owner, branch: @branch, purchase_order_id: po.id, reference: "IBFT-#{51_000 + i}", note: "Advance against #{po.label}")
      end
    end

    def waste_and_count_for_day!(day)
      if day_at(0.66) == day
        go(at(day, 23, 20))
        doc = Stock::Posting.create!({ kind: "waste", from_section_id: @kitchen.id, reason: "Spoiled in the fridge", note: "Chiller tripped overnight" }, lines: [
          { stock_item_id: @items["CHK"].id, unit_id: unit("kg").id, quantity: 2 }, { stock_item_id: @items["TOM"].id, unit_id: unit("kg").id, quantity: 3 },
          { stock_item_id: @items["BUN"].id, quantity: 12 }, { stock_item_id: @items["MLK"].id, unit_id: unit("l").id, quantity: 2 }
        ], actor: @manager, branch: @branch)
        Stock::Posting.post!(doc, actor: @manager)
        @stats[:stock_documents] += 1
      end
      if day_at(0.83) == day
        go(at(day, 23, 40))
        settings = InventorySetting.current
        was_open = settings.counting_open
        settings.update!(counting_open: true)
        lines = %w[CHK BUN COLA WTR RICE BOX].map do |sku|
          item = @items[sku]
          on_hand = StockLevel.find_by(stock_section_id: @kitchen.id, stock_item_id: item.id)&.quantity || 0
          counted = (on_hand * BigDecimal(pick([ "0.97", "0.985", "1.0", "1.01" ]))).round(item.base_unit.kind == "count" ? 0 : -1)
          { stock_item_id: item.id, unit_id: item.base_unit.id, quantity: counted, counted_qty: counted }
        end
        doc = Stock::Posting.create!({ kind: "count", from_section_id: @kitchen.id, note: "Weekly count after close" }, lines: lines, actor: @manager, branch: @branch)
        Stock::Posting.post!(doc, actor: @manager)
        settings.update!(counting_open: was_open)
        @stats[:stock_documents] += 1
      end
    end

    # Three items end up below their minimum; everything else sits comfortably above it.
    def tune_minimums!
      travel_back
      items = STOCK_ITEMS.map { |r| @items[r[0]].reload }
      on_hand = items.to_h { |i| [ i.sku, i.total_quantity ] }
      low = %w[CHS LET COAL]
      items.each do |i|
        qty = on_hand[i.sku]
        minimum = if low.include?(i.sku)
          qty.positive? ? (qty * BigDecimal("1.6")).ceil : 500
        else
          qty.positive? ? (qty * BigDecimal("0.35")).floor : 0
        end
        i.update_columns(minimum_qty: minimum, reorder_qty: minimum * 2)
      end
    end

    # ---------------------------------------------------------------- employees, attendance, payroll

    EMPLOYEES = [
      [ "Rashid Mehmood", "Head chef", "Kitchen", 65_000 ], [ "Imran Ali", "Cook", "Kitchen", 45_000 ], [ "Bilal Ahmed", "Kitchen helper", "Kitchen", 28_000 ],
      [ "Usman Tariq", "Waiter", "Service", 30_000 ], [ "Zeeshan Haider", "Waiter", "Service", 30_000 ], [ "Ayesha Khan", "Cashier", "Service", 35_000 ],
      [ "Farhan Siddiqui", "Manager", "Management", 80_000 ], [ "Kashif Raza", "Rider", "Delivery", 32_000 ]
    ].freeze

    def setup_employees!
      departments = %w[Kitchen Service Management Delivery].to_h { |d| [ d, Department.active.find_by(name: d) || Department.create!(name: d)] }
      hra = SalaryComponent.active.find_by(name: "House rent allowance") || SalaryComponent.create!(name: "House rent allowance", kind: "earning", is_percent: true, percent: 10)
      eobi = SalaryComponent.active.find_by(name: "EOBI") || SalaryComponent.create!(name: "EOBI", kind: "deduction", default_amount_minor: minor(1_500))
      rule = AttendanceRule.find_or_create_by!(employee_id: nil)
      rule.update!(rules_enabled: true, shift_start: "10:00", shift_end: "19:00", grace_minutes: 15, late_after_minutes: 15, late_fine_minor: minor(300), late_penalty: "fine_only", absent_after_minutes: 300,
                   absent_penalty: "lose_day", free_lates: 2, fine_cap_minor: minor(3_000), no_scan_counts_absent: true, working_days: [ 1, 2, 3, 4, 5, 6 ])
      @employees = EMPLOYEES.each_with_index.map do |(name, designation, dept, salary), i|
        e = Employee.active.find_by(name: name) || Employee.create!(name: name, designation: designation, department: departments[dept], base_salary_minor: minor(salary), branch: @branch,
                                                                    phone: "+92345#{(2_100_000 + i * 1_111).to_s.rjust(7, '0')}", cnic: "35202-#{(1_000_000 + i * 97_531).to_s.rjust(7, '0')}-#{1 + i % 9}",
                                                                    joined_on: Date.new(2025, 1 + i % 12, 1 + i), shares_tips: dept == "Service", fingerprint_enrolled: true, fingerprint_id: "FP-#{100 + i}", fingerprint_enrolled_at: Time.current)
        e.employee_salary_components.find_or_create_by!(salary_component: hra) if i.even?
        e.employee_salary_components.find_or_create_by!(salary_component: eobi)
        e
      end
      link_membership!(@employees[5], @cashier)
      link_membership!(@employees[6], @manager)
      @rider.update!(membership_id: nil) if @rider.membership_id && !Membership.exists?(id: @rider.membership_id)
    end

    def link_membership!(employee, membership)
      return if employee.membership_id || Employee.exists?(membership_id: membership.id)
      employee.update!(membership: membership)
    end

    def setup_attendance!
      from = [ @start_day, @today.prev_month.beginning_of_month ].min
      leave_employee = @employees[3]
      leave_from = @today.beginning_of_month + 2
      leave_to = leave_from + 2
      unless LeaveRequest.exists?(employee_id: leave_employee.id, from_date: leave_from)
        LeaveRequest.create!(employee: leave_employee, kind: "paid", from_date: leave_from, to_date: leave_to, reason: "Family wedding in Faisalabad", status: "approved", approved_by_membership_id: @manager.id, decided_at: Time.current)
      end
      (from..@today).each do |day|
        next if day.wday.zero? # weekly off
        @employees.each_with_index do |e, i|
          next if Attendance.exists?(employee_id: e.id, business_day: day)
          if e == leave_employee && day.between?(leave_from, leave_to)
            Payroll::Attendance.mark!(e, day: day, status: "leave", by: @manager, note: "Approved leave")
            next
          end
          roll = @rng.rand
          if roll < 0.05
            Payroll::Attendance.mark!(e, day: day, status: "absent", by: @manager, note: pick([ "No show", "Sick, no leave filed", "Did not call" ]))
            next
          end
          late = roll < 0.17
          check_in = late ? at(day, 10, rand_i(20..55)) : at(day, 9, rand_i(35..59))
          check_in = at(day, 10, rand_i(0..14)) if !late && chance(0.3)
          next if check_in > @real_now
          Payroll::Attendance.check_in!(e, at: check_in, source: "fingerprint", branch: @branch)
          check_out = at(day, 19, rand_i(0..50))
          check_out = at(day, 23, rand_i(0..30)) if i < 3 # kitchen closes late
          Payroll::Attendance.check_out!(e, at: check_out) if check_out <= @real_now
        end
      end
    end

    def payroll_day = [ [ @today.beginning_of_month + 4, @start_day ].max, @today ].min

    def payroll_for_day!(day)
      return unless day == payroll_day
      month = @today.prev_month.beginning_of_month
      return if PayrollRun.where(month: month).where.not(status: "cancelled").exists?
      go(at(day, 11, 0))
      run = Payroll::Runner.generate!(month: month, actor: @manager, notes: "Generated from the attendance kiosk")
      go_forward(40.minutes)
      Payroll::Runner.pay!(run, actor: @owner, branch: @branch, method_code: "bank")
      @stats[:payroll_runs] += 1
    end

    # ---------------------------------------------------------------- finance and expenses

    def owner_capital!(day)
      go(at(day, 9, 0))
      bank = PaymentMethod.active.find_by(code: "bank")&.payment_account || PaymentAccount.active.company.find_by(kind: "bank") || PaymentAccount.active.company.first
      amount = minor(800_000)
      bank.post!(kind: "deposit", amount_minor: amount, business_day: day, description: "Owner capital introduced", by: @owner, branch_id: @branch.id, skip_journal: true)
      Finance::Journal.post!(business_day: day, kind: "manual", description: "Owner capital introduced to fund the month", actor: @owner, branch_id: @branch.id,
                             lines: [ { account: Finance::Chart.for_payment_account(bank), debit_minor: amount, description: "Deposit to #{bank.name}" }, { account: "3010", credit_minor: amount, description: "Owner's capital" } ])
    end

    def cash_to_bank!(day)
      go(at(day, 12, 30))
      cash = PaymentMethod.active.find_by(code: "cash")&.payment_account or return
      bank = PaymentMethod.active.find_by(code: "bank")&.payment_account or return
      amount = [ minor(200_000), cash.reload.current_balance_minor ].min
      return if amount <= 0
      PaymentAccount.transaction do
        cash.post!(kind: "transfer_out", amount_minor: -amount, business_day: day, description: "Transfer to #{bank.name}: weekly deposit", by: @owner, branch_id: @branch.id)
        bank.post!(kind: "transfer_in", amount_minor: amount, business_day: day, description: "Transfer from #{cash.name}: weekly deposit", by: @owner, branch_id: @branch.id)
        Finance::Journal.transfer!(from: cash, to: bank, amount_minor: amount, business_day: day, actor: @owner, note: "weekly deposit")
      end
    end

    # fraction of the period (nil means a repeating rule), category path, amount Rs, method, paid to, note
    EXPENSES = [
      [ :first_of_month, [ "Rent" ], 150_000, "bank", "Malik Estate", "Shop rent" ],
      [ 0.07, [ "Utilities", "Electricity" ], 46_500, "bank", "LESCO", "Electricity bill" ],
      [ 0.1, [ "Utilities", "Gas" ], 18_200, "cash", "SNGPL", "Gas bill" ],
      [ 0.17, [ "Utilities", "Water" ], 3_000, "cash", "WASA", "Water bill" ],
      [ 0.2, [ "Utilities", "Internet" ], 4_000, "easypaisa", "PTCL", "Fibre internet" ],
      [ 0.07, [ "Kitchen", "Gas cylinder" ], 6_500, "cash", "Gas depot", "Two cylinders" ],
      [ 0.3, [ "Kitchen", "Gas cylinder" ], 6_500, "cash", "Gas depot", "Two cylinders" ],
      [ 0.53, [ "Kitchen", "Gas cylinder" ], 6_800, "cash", "Gas depot", "Two cylinders" ],
      [ 0.77, [ "Kitchen", "Gas cylinder" ], 6_800, "cash", "Gas depot", "Two cylinders" ],
      [ 0.4, [ "Kitchen", "Repairs" ], 8_500, "cash", "Rafiq Electrician", "Deep fryer thermostat" ],
      [ 0.13, [ "Kitchen", "Cleaning" ], 2_500, "cash", "Clean Co", "Weekly deep clean" ],
      [ 0.37, [ "Kitchen", "Cleaning" ], 2_500, "cash", "Clean Co", "Weekly deep clean" ],
      [ 0.6, [ "Kitchen", "Cleaning" ], 2_500, "cash", "Clean Co", "Weekly deep clean" ],
      [ 0.83, [ "Kitchen", "Cleaning" ], 2_800, "cash", "Clean Co", "Weekly deep clean" ],
      [ 0.1, [ "Transport", "Fuel" ], 3_000, "cash", "PSO Gulberg", "Rider bike fuel" ],
      [ 0.23, [ "Transport", "Fuel" ], 3_000, "cash", "PSO Gulberg", "Rider bike fuel" ],
      [ 0.47, [ "Transport", "Fuel" ], 3_200, "cash", "PSO Gulberg", "Rider bike fuel" ],
      [ 0.7, [ "Transport", "Fuel" ], 3_200, "cash", "PSO Gulberg", "Rider bike fuel" ],
      [ 0.9, [ "Transport", "Fuel" ], 3_200, "cash", "PSO Gulberg", "Rider bike fuel" ],
      [ 0.33, [ "Marketing" ], 12_000, "bank", "Meta Ads", "Facebook and Instagram ads" ],
      [ 0.47, [ "Petty cash", "Stationery" ], 1_200, "cash", "Book Centre", "Receipt rolls and pens" ],
      [ 0.6, [ "Petty cash", "Misc" ], 1_800, "cash", "Market", "Napkins and tissue" ],
      [ 0.27, [ "Salaries", "Advance" ], 10_000, "cash", "Bilal Ahmed", "Salary advance" ],
      [ 0.9, [ "Kitchen", "Repairs" ], 4_500, "cash", "AC Service", "Hall AC service" ]
    ].freeze

    def expense_category(path)
      parent = ExpenseCategory.active.find_by(name: path[0], parent_id: nil) || ExpenseCategory.create!(name: path[0])
      return parent if path.size == 1
      ExpenseCategory.active.find_by(name: path[1], parent_id: parent.id) || ExpenseCategory.create!(name: path[1], parent: parent)
    end

    def expenses_for_day!(day)
      EXPENSES.each_with_index do |(when_, path, amount, method, paid_to, note), i|
        due = when_ == :first_of_month ? (day == day.beginning_of_month || (day == @start_day && @days < 30)) : day_at(when_) == day
        next unless due
        go(at(day, 11 + (i % 6), (5 + i * 7) % 60))
        Expenses::Recorder.create!({ category_id: expense_category(path).id, amount_minor: minor(amount), method_code: method, paid_to: paid_to, note: note, spent_on: day.to_s }, actor: @manager, branch: @branch)
        @stats[:expenses] += 1
      end
    end

    def rider_float_for_day!(day)
      if day == @start_day
        go(at(day, 10, 15))
        Riders::Float.move!(@rider, kind: "issue", amount_minor: minor(2_000), actor: @manager, branch: @branch, reason: "Morning float") if @rider.reload.float_minor.zero?
      end
      if day_at(0.3) == day || day_at(0.75) == day
        go(at(day, 15, 10))
        Riders::Float.move!(@rider, kind: "spend", amount_minor: minor(300), actor: @manager, branch: @branch, reason: "Petrol top-up") if @rider.reload.float_minor >= minor(300)
      end
      if day_at(0.5) == day
        go(at(day, 23, 50))
        Riders::Float.move!(@rider, kind: "return", amount_minor: minor(500), actor: @manager, branch: @branch, reason: "Returned at close") if @rider.reload.float_minor >= minor(500)
      end
      return unless day == @today
      temp = Rider.temporary.find_by(name: "Saad (temporary)")
      unless temp
        go(at(day, 10, 40))
        life = Rider.lifetime_for("n_orders", 5, branch: @branch)
        temp = Rider.create!(branch: @branch, name: "Saad (temporary)", phone: "+923459876543", vehicle: "Bike", temporary: true, lifetime_kind: "n_orders", lifetime_value: 5, orders_allowed: life[:orders_allowed], expires_at: life[:expires_at])
        Riders::Float.move!(temp, kind: "issue", amount_minor: minor(1_000), actor: @manager, branch: @branch, reason: "Float for the evening rush")
      end
      @temp_rider = temp
    end

    def khata_receipts_for_day!(day)
      return unless (day - @start_day) % 5 == 4
      customer = Customer.active.where(id: @credit_customers.map(&:id)).where("balance_minor > 0").order(balance_minor: :desc).first or return
      go(at(day, 17, rand_i(0..50)))
      amount = chance(0.5) ? customer.balance_minor : (customer.balance_minor * 0.5).round
      amount = (amount / 100) * 100
      return if amount <= 0
      Payments::Khata.receive!(customer, amount_minor: amount, method_code: pick(%w[cash cash bank easypaisa]), reference: "KH-#{rand_i(1000..9999)}", actor: @cashier, shift: @shift, branch: @branch)
    end

    # ---------------------------------------------------------------- the timeline

    HOUR_WEIGHTS = { 10 => 1, 11 => 2, 12 => 6, 13 => 8, 14 => 6, 15 => 3, 16 => 2, 17 => 2, 18 => 3, 19 => 6, 20 => 8, 21 => 8, 22 => 6, 23 => 3, 0 => 1 }.freeze
    VOID_REASONS = [ "Customer changed their mind", "Wrong table punched", "Duplicate order", "Kitchen out of stock", "Customer left without ordering" ].freeze
    REFUND_REASONS = [ "Cold food, customer complaint", "Wrong item delivered", "Overcharged by mistake", "Order took too long" ].freeze

    def seed_timeline!
      (@start_day..@today).each do |day|
        ActiveRecord::Base.transaction do
          seed_day!(day)
        end
        log("#{day}: #{@stats[:orders]} orders so far")
      end
    end

    def seed_day!(day)
      is_today = day == @today
      owner_capital!(day) if day == @start_day
      opening_stock!(day) if day == @start_day
      receipts_for_day!(day)
      rider_float_for_day!(day)
      go(at(day, 10, 0))
      @shift = Shifts::Manager.open!(cashier: @cashier, branch: @branch, device: @till, opening_cash_minor: minor(5_000))
      expenses_for_day!(day)
      payroll_for_day!(day)
      cash_to_bank!(day) if day_at(0.5) == day
      target = day.wday.in?([ 5, 6 ]) ? rand_i(34..44) : rand_i(25..30)
      times = Array.new(target) { at(day, weighted(HOUR_WEIGHTS.to_a), rand_i(0..59)) }.sort
      times = times.select { |t| t < @real_now - 65.minutes } if is_today
      specials = plan_specials(day, times.size)
      times.each_with_index do |time, idx|
        go(time)
        case specials[idx]
        when :void then void_order!
        when :staff_meal then staff_meal!
        when :refund then paid_order!(refund: true)
        else paid_order!
        end
      end
      khata_receipts_for_day!(day)
      waste_and_count_for_day!(day)
      if is_today
        open_orders_today!
      else
        close_shift!(day)
      end
    end

    def plan_specials(day, count)
      specials = {}
      return specials if count < 6
      specials[rand_i(0...count)] = :void if chance(0.4)
      specials[rand_i(0...count)] = :staff_meal if chance(0.3)
      specials[rand_i(0...count)] = :refund if chance(0.26)
      specials
    end

    def free_table
      busy = Order.open.where.not(table_id: nil).pluck(:table_id)
      @tables.reject { |t| busy.include?(t.id) }.then { |free| free.empty? ? nil : pick(free) }
    end

    def customer_for(order_type)
      case order_type
      when "delivery" then pick(@delivery_customers)
      when "dine_in" then chance(0.3) ? pick(@customers) : nil
      when "takeaway" then chance(0.4) ? pick(@customers) : nil
      else chance(0.15) ? pick(@customers) : nil
      end
    end

    def build_order!(order_type: nil, extra: {}, lines: nil)
      order_type ||= weighted([ [ "dine_in", 35 ], [ "takeaway", 25 ], [ "walk_in", 25 ], [ "delivery", 15 ] ])
      actor = chance(0.25) ? @manager : @cashier
      customer = customer_for(order_type)
      attrs = { order_type: order_type, source: "till", customer_id: customer&.id }.merge(extra)
      if order_type == "dine_in"
        table = free_table
        if table
          attrs[:table_id] = table.id
          attrs[:covers] = rand_i(1..6)
        else
          attrs[:order_type] = "walk_in"
        end
      end
      if order_type == "delivery"
        address = customer.addresses.first
        attrs[:address_id] = address.id
        attrs[:delivery_charge_minor] = zone_charge_for(address)
        attrs[:rider_id] = (@temp_rider && chance(0.3) ? @temp_rider : @rider).id
      end
      if order_type == "takeaway" && chance(0.15)
        attrs[:source] = "foodpanda"
        attrs[:aggregator_ref] = "FP-#{rand_i(100_000..999_999)}"
      end
      attrs[:guest_name] = pick([ "Ali", "Sara", "Table by the window", "Mr Khan" ]) if order_type == "dine_in" && customer.nil? && chance(0.3)
      builder = Orders::Builder.create!(attrs, lines: lines || random_lines, actor: actor, device: @till, branch: @branch)
      order = builder.order
      order.update_columns(aggregator_commission_minor: (order.subtotal_minor * 0.25).round) if attrs[:source] == "foodpanda"
      @stats[:orders] += 1
      [ order, actor, customer ]
    end

    def apply_discounts!(order, actor, customer)
      if customer && chance(0.3) && order.editable?
        voucher = Voucher.find_by(customer_id: customer.id, voucher_batch_id: @voucher_batch.id, status: "issued")
        base = order.subtotal_minor - order.discounts.where.not(kind: "voucher").sum(:amount_minor)
        if voucher && base >= @voucher_batch.min_spend_minor && order.discounts.where(kind: "voucher").none?
          Marketing::Vouchers.redeem!(order, code: voucher.code, actor: actor)
          return
        end
      end
      return unless chance(0.07)
      kind, value, reason = pick([ [ "percent", 10, "Regular customer" ], [ "percent", 15, "Manager discount" ], [ "fixed", 100, "Late order apology" ], [ "percent", 5, "Staff friend" ] ])
      order.discounts.create!(kind: kind, value: value, reason: reason, applied_by_membership_id: actor.id, approved_by_membership_id: @manager.id)
      Orders::Pricing.recalculate!(order.reload)
      Orders::Pricing.save_all!(order)
    end

    def payment_lines_for(order, customer, tip = 0)
      due = order.total_minor - order.paid_minor + tip
      method = weighted([ [ "cash", 60 ], [ "card", 15 ], [ "easypaisa", 10 ], [ "jazzcash", 8 ] ])
      method = "bank" if order.source == "foodpanda"
      method = "khata" if customer && customer.credit_limit_minor && chance(0.5) && !customer.reload.over_limit?(due) && order.source != "foodpanda"
      line = { method_code: method, amount_minor: due }
      case method
      when "cash"
        step = due > minor(2_000) ? minor(1_000) : minor(500)
        line[:tendered_minor] = chance(0.6) ? ((due + step - 1) / step) * step : due
      when "card" then line[:card_terminal_ref] = "AUTH#{rand_i(100_000..999_999)}"
      when "bank" then line[:reference] = "FP-SETTLE-#{rand_i(1000..9999)}"
      when "khata" then nil
      else line[:reference] = "TXN#{rand_i(10_000_000..99_999_999)}"
      end
      line
    end

    # Place, sometimes mark preparing (the kitchen screen bump), then ready.
    def kitchen_flow!(order, actor)
      Orders::Transitions.place!(order, actor: actor, device: @till)
      if chance(0.3)
        go_forward(rand_i(1..5).minutes)
        Orders::Transitions.start!(order, actor: actor)
      end
      go_forward(rand_i(7..20).minutes)
      Orders::Transitions.ready!(order, actor: actor)
    end

    def paid_order!(refund: false)
      order, actor, customer = build_order!
      apply_discounts!(order, actor, customer)
      kitchen_flow!(order, actor)
      case order.order_type
      when "dine_in"
        Orders::Transitions.serve!(order, actor: actor, device: @till)
        go_forward(rand_i(15..45).minutes)
      when "delivery"
        delivery = Deliveries::Manager.ensure_for!(order)
        go_forward(rand_i(2..6).minutes)
        Deliveries::Manager.move!(delivery, to: "picked_up", actor: actor)
        go_forward(rand_i(18..40).minutes)
        Deliveries::Manager.move!(delivery, to: "delivered", actor: actor, note: "Handed to the customer")
        @stats[:deliveries] += 1
      else
        go_forward(rand_i(1..4).minutes)
      end
      tip = order.order_type == "dine_in" && chance(0.25) ? minor(pick([ 50, 100, 150, 200 ])) : 0
      payer = order.order_type == "delivery" ? @cashier : actor
      Payments::Processor.new(order, actor: payer, device: @till, shift: @shift).call(payments: [ payment_lines_for(order, customer, tip) ], tip_minor: tip)
      order.reload
      # The till completes most orders at payment (paid); some are closed explicitly afterwards (closed).
      Orders::Transitions.close!(order, actor: payer, device: @till) if order.payment_status == "paid" && chance(0.4)
      @paid_orders_with_customer ||= []
      @paid_orders_with_customer << order.id if customer && @paid_orders_with_customer.size < 60
      refund_order!(order) if refund
      order
    end

    def refund_order!(order)
      go_forward(rand_i(10..30).minutes)
      partial = chance(0.5) && order.active_items.size > 1
      amount = partial ? order.active_items.first.line_total_minor : order.paid_minor
      method = order.payments.where(status: "captured").first&.method_code || "cash"
      method = "cash" if method == "khata" && order.customer_id.nil?
      Payments::Refunder.call(order, amount_minor: amount, method_code: method, reason: pick(REFUND_REASONS), actor: @manager, approver: @manager, device: @till, shift: @shift)
      @stats[:refunds] += 1
    end

    def void_order!
      order, actor, = build_order!
      Orders::Transitions.place!(order, actor: actor, device: @till)
      go_forward(rand_i(2..12).minutes)
      Orders::Transitions.start!(order, actor: actor) if chance(0.5)
      Orders::Transitions.void!(order, reason: pick(VOID_REASONS), actor: actor, approver: @manager, device: @till)
      @stats[:voids] += 1
    end

    def staff_meal!
      line = { product_id: weighted(@product_weights.select { |p, _| @mains.include?(p) }).id, quantity: 1 }
      order, actor, = build_order!(order_type: "walk_in", extra: { is_staff_meal: true, staff_meal_reason: pick([ "Staff lunch", "Kitchen dinner", "Rider meal" ]), staff_meal_approved_by_id: @manager.id, customer_id: nil }, lines: [ line ])
      kitchen_flow!(order, actor)
      go_forward(2.minutes)
      Orders::Transitions.close!(order.reload, actor: actor, device: @till)
      @stats[:staff_meals] += 1
    end

    # Today's open orders: a few placed, preparing and ready so Pending Orders and the kitchen screen show work.
    def open_orders_today!
      wanted = rand_i(5..8)
      wanted.times do |i|
        go(@real_now - rand_i(4..55).minutes)
        type = pick(%w[dine_in dine_in takeaway walk_in delivery])
        order, actor, = build_order!(order_type: type)
        Orders::Transitions.place!(order, actor: actor, device: @till)
        state = i % 3
        if state >= 1
          go_forward(rand_i(1..3).minutes)
          Orders::Transitions.start!(order, actor: actor)
        end
        if state == 2
          go_forward(rand_i(3..8).minutes)
          Orders::Transitions.ready!(order, actor: actor)
        end
        @stats[:open_orders] += 1
      end
      travel_back
    end

    def close_shift!(day)
      go(at(day, 1, 30))
      expected = @shift.reload.expected_cash
      counted = chance(0.2) ? expected - minor(pick([ 50, 100, 250, 500 ])) : expected
      Shifts::Manager.close!(@shift, counted_cash_minor: counted, by: @cashier, approver: @manager, note: counted == expected ? nil : "Short on close; cashier to make up")
      Shifts::Manager.settle!(@shift, by: @manager)
      @stats[:shifts] += 1
    end

    # ---------------------------------------------------------------- reviews

    REVIEWS = [
      [ 5, "Best karahi in Gulberg, will come again." ], [ 4, "Food was great, service a bit slow at dinner time." ], [ 5, "Biryani on point. Delivery was quick." ],
      [ 3, "Good taste but the portion got smaller." ], [ 5, "Zinger was crispy and hot. Loved it." ], [ 2, "Waited 40 minutes for tikka." ], [ 4, "Fresh naan, friendly staff." ],
      [ 5, "Perfect family dinner spot." ], [ 1, "Order arrived cold and the drink was missing." ], [ 4, "Malai boti was excellent, chai could be stronger." ]
    ].freeze

    def seed_reviews!
      travel_back
      return if Review.exists?
      ids = Array(@paid_orders_with_customer)
      orders = Order.where(id: ids).order(:paid_at).to_a
      orders = Order.where(status: %w[paid closed]).where.not(customer_id: nil).order(:paid_at).limit(60).to_a if orders.empty?
      return if orders.empty?
      step = [ orders.size / REVIEWS.size, 1 ].max
      REVIEWS.each_with_index do |(rating, comment), i|
        order = orders[(i * step) % orders.size]
        at = (order.paid_at || order.created_at) + rand_i(20..120).minutes
        review = Reviews.create!({ rating: rating, comment: comment, source: pick(%w[tablet tablet website qr]) }, order: order)
        review.update_columns(created_at: at, updated_at: at, rated_at: at)
      end
    end
  end
end

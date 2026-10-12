# The demo restaurant for client demos: the business, its owner, manager and cashier, a realistic menu with Urdu names,
# variants, modifiers, order-type prices and a deal, floors and tables, and paired devices with lasting pairing codes.
# Idempotent: runs on a server as many times as needed; Demo::RichSeed then adds a month of history on top.
module Demo
  class Restaurant
    Result = Struct.new(:business, :owner, :created, keyword_init: true)

    OWNER_NAME = "Demo Owner"
    MANAGER_PIN = "9999"
    CASHIER_PIN = "1111"
    TILL_CODE = "123456"
    KITCHEN_CODE = "654321"

    # category, Urdu, station, products: [name, Urdu, price, options]
    MENU = [
      [ "BBQ", "باربی کیو", "Grill", [
        [ "Chicken Tikka", "چکن تکہ", 550, { weights: true, spice: true } ],
        [ "Malai Boti (6 pcs)", "ملائی بوٹی", 650, { spice: true } ],
        [ "Seekh Kabab (4 pcs)", "سیخ کباب", 600, { spice: true } ],
        [ "Chicken Boti Platter", "چکن بوٹی پلیٹر", 1250, { delivery: 1350 } ]
      ] ],
      [ "Karahi", "کڑاہی", "Grill", [
        [ "Chicken Karahi (full)", "چکن کڑاہی (فل)", 2200, { spice: true, delivery: 2400 } ],
        [ "Chicken Karahi (half)", "چکن کڑاہی (ہاف)", 1200, { spice: true, delivery: 1300 } ],
        [ "Mutton Karahi (half)", "مٹن کڑاہی (ہاف)", 2100, { spice: true } ]
      ] ],
      [ "Rice", "چاول", "Kitchen", [
        [ "Chicken Biryani", "چکن بریانی", 420, { variants: [ [ "Single", 420 ], [ "Double", 780 ] ], extras: true } ],
        [ "Plain Rice", "سادہ چاول", 180, {} ],
        [ "Chicken Pulao", "چکن پلاؤ", 400, {} ]
      ] ],
      [ "Burgers", "برگرز", "Kitchen", [
        [ "Zinger Burger", "زنگر برگر", 450, { variants: [ [ "Regular", 450 ], [ "Double", 650 ] ], extras: true, delivery: 500 } ],
        [ "Beef Burger", "بیف برگر", 480, { extras: true } ],
        [ "Chicken Patty Burger", "چکن پیٹی برگر", 350, { extras: true } ],
        [ "Fries", "فرائز", 220, { variants: [ [ "Regular", 220 ], [ "Large", 320 ] ] } ]
      ] ],
      [ "Drinks", "مشروبات", "Drinks", [
        [ "Chai", "چائے", 80, {} ],
        [ "Cold Drink 345ml", "کولڈ ڈرنک", 90, {} ],
        [ "Mineral Water 500ml", "منرل واٹر", 60, {} ],
        [ "Fresh Lime", "فریش لائم", 150, {} ],
        [ "Lassi", "لسی", 180, { variants: [ [ "Sweet", 180 ], [ "Salted", 180 ] ] } ]
      ] ],
      [ "Desserts", "میٹھا", "Kitchen", [
        [ "Gulab Jamun (2 pcs)", "گلاب جامن", 150, {} ],
        [ "Kheer", "کھیر", 180, {} ],
        [ "Brownie with Ice Cream", "براؤنی", 350, {} ]
      ] ]
    ].freeze

    def self.seed!(email:, password:, business_name: "Demo Cafe", country: "PK", log: nil)
      user = User.find_by(email: email)
      owner_user = user
      created = false
      if user
        membership = Membership.joins(:role).where(user_id: user.id, roles: { system_key: "owner" }).first or raise "#{email} exists but owns no business"
        business = membership.business
      else
        r = Auth::Signup.call(name: OWNER_NAME, business_name: business_name, email: email, password: password, country: country,
                              currency: country == "PK" ? "PKR" : "USD", time_zone: country == "PK" ? "Asia/Karachi" : "UTC")
        business = r.business
        owner_user = r.user
        created = true
        log&.call("Created #{business_name} (#{business.slug}) for #{email}")
      end
      new(business, log: log).seed!
      Result.new(business: business, owner: owner_user, created: created)
    end

    def initialize(business, log: nil)
      @business = business
      @log = log
    end

    def seed!
      Tenancy::Context.with(@business) do
        owner = Membership.joins(:role).find_by(roles: { system_key: "owner" })
        Current.membership = owner
        Current.user = owner.user
        @branch = Branch.order(:created_at).first
        staff!
        menu! if Product.active.none?
        tables!
        devices!
      end
      self
    end

    private

    def say(msg) = @log&.call(msg)

    def staff!
      @branch.update!(tax_registration: { "authority" => "pra", "ntn" => "0000000-0", "pos_id" => "DEMO" }) if @branch.tax_registration.blank?
      member("manager", "Demo Manager", MANAGER_PIN, email: "manager@#{@business.slug}.demo")
      member("cashier", "Demo Cashier", CASHIER_PIN, phone: "+923001112233")
    end

    def member(role_key, name, pin, email: nil, phone: nil)
      role = Role.find_by!(system_key: role_key)
      existing = Membership.joins(:user).where(role_id: role.id, users: { name: name }).first
      return existing if existing
      user = User.create!(name: name, email: email, phone: phone, password: email ? "password123" : nil)
      m = Membership.create!(user: user, role: role, status: "active")
      m.set_pin!(pin)
      say("Staff: #{name} (#{role_key}, PIN #{pin})")
      m
    end

    def menu!
      tax = TaxRate.active.find_by(is_default: true) || TaxRate.create!(name: "PRA 16%", rate: 16, inclusive: false, authority: "pra", is_default: true)
      stations = %w[Grill Kitchen Drinks].index_with { |n| Station.active.find_by(branch_id: @branch.id, name: n) || Station.create!(branch: @branch, name: n) }
      menu = Menu.active.find_by(is_default: true) || Menu.create!(name: "Main", is_default: true)
      spice = ModifierGroup.active.find_by(name: "Spice level") || ModifierGroup.create!(name: "Spice level", min_select: 0, max_select: 1).tap do |g|
        [ [ "Mild", "ہلکا", 0 ], [ "Medium", "درمیانہ", 0 ], [ "Extra hot", "زیادہ تیز", 20 ] ].each { |n, ur, p| Modifier.create!(modifier_group: g, name: n, name_ur: ur, price_minor: p * 100) }
      end
      extras = ModifierGroup.active.find_by(name: "Extras") || ModifierGroup.create!(name: "Extras", min_select: 0, max_select: 3).tap do |g|
        [ [ "Extra cheese", "اضافی چیز", 60 ], [ "Extra raita", "اضافی رائتہ", 30 ], [ "Add egg", "انڈا", 40 ], [ "No onions", "پیاز نہیں", 0 ] ].each { |n, ur, p| Modifier.create!(modifier_group: g, name: n, name_ur: ur, price_minor: p * 100) }
      end
      products = {}
      MENU.each_with_index do |(cat_name, cat_ur, station, items), ci|
        category = Category.create!(menu: menu, name: cat_name, name_ur: cat_ur, station_id: stations[station].id, sort_order: ci)
        items.each_with_index do |(name, ur, price, opts), pi|
          p = Product.create!(category: category, name: name, name_ur: ur, base_price_minor: price * 100, tax_rate: tax, sort_order: pi)
          p.product_prices.create!(order_type: "delivery", price_minor: opts[:delivery] * 100) if opts[:delivery]
          (opts[:variants] || []).each { |vn, vp| p.variants.create!(name: vn, price_minor: vp * 100) }
          p.product_modifier_groups.create!(modifier_group: spice) if opts[:spice]
          p.product_modifier_groups.create!(modifier_group: extras) if opts[:extras]
          products[name] = p
        end
      end
      deal = Deal.create!(name: "Lunch Box", price_minor: 55_000, tax_rate: tax)
      deal.deal_items.create!(product: products["Zinger Burger"], quantity: 1)
      deal.deal_items.create!(product: products["Fries"], quantity: 1)
      deal.deal_items.create!(product: products["Cold Drink 345ml"], quantity: 1)
      family = Deal.create!(name: "Family Platter", price_minor: 320_000, tax_rate: tax)
      family.deal_items.create!(product: products["Chicken Karahi (full)"], quantity: 1)
      family.deal_items.create!(product: products["Seekh Kabab (4 pcs)"], quantity: 2)
      family.deal_items.create!(product: products["Plain Rice"], quantity: 2)
      say("Menu: #{MENU.size} categories, #{products.size} products, 2 modifier groups, 2 deals")
    end

    def tables!
      return if DiningTable.active.where(branch_id: @branch.id).count >= 8
      hall = Floor.active.find_by(branch_id: @branch.id, name: "Hall") || Floor.create!(branch: @branch, name: "Hall")
      roof = Floor.active.find_by(branch_id: @branch.id, name: "Rooftop") || Floor.create!(branch: @branch, name: "Rooftop")
      6.times { |i| DiningTable.find_or_create_by!(branch: @branch, code: "T#{i + 1}") { |t| t.seats = i < 4 ? 4 : 6; t.location = "Hall"; t.floor = hall } }
      4.times { |i| DiningTable.find_or_create_by!(branch: @branch, code: "R#{i + 1}") { |t| t.seats = 4; t.location = "Rooftop"; t.floor = roof } }
      say("Tables: 10 on 2 floors")
    end

    def devices!
      till = Device.where(branch_id: @branch.id, kind: "till").order(:created_at).first || Device.create!(branch: @branch, name: "Counter till", kind: "till")
      kds = Device.where(branch_id: @branch.id, kind: "kitchen").order(:created_at).first || Device.create!(branch: @branch, name: "Kitchen screen", kind: "kitchen")
      till.update!(pairing_code: TILL_CODE, pairing_expires_at: 10.years.from_now) if till.pairing_code != TILL_CODE
      kds.update!(pairing_code: KITCHEN_CODE, pairing_expires_at: 10.years.from_now) if kds.pairing_code != KITCHEN_CODE
      say("Devices: till pairing code #{TILL_CODE}, kitchen pairing code #{KITCHEN_CODE}")
    end
  end
end

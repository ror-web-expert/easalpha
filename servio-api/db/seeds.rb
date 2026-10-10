Plan.seed!
WhatsappTemplate.seed_defaults!
if Rails.env.development? && !User.exists?(email: "demo@servio.pk")
  r = Auth::Signup.call(name: "Demo Owner", business_name: "Demo Cafe", email: "demo@servio.pk", password: "password123")
  Tenancy::Context.with(r.business, user: r.user, membership: r.membership) do
    Branch.first.update!(tax_registration: { "authority" => "pra", "ntn" => "0000000-0", "pos_id" => "DEMO" })
    manager = Membership.create!(user: User.create!(name: "Demo Manager", email: "manager@servio.pk", password: "password123"), role: Role.find_by!(system_key: "manager"), status: "active")
    manager.set_pin!("9999")
    cashier = Membership.create!(user: User.create!(name: "Demo Cashier", phone: "+923001112233"), role: Role.find_by!(system_key: "cashier"), status: "active")
    cashier.set_pin!("1111")
    device = Device.create!(branch: Branch.first, name: "Counter till", kind: "till")
    device.update!(pairing_code: "123456", pairing_expires_at: 10.years.from_now)
    kds = Device.create!(branch: Branch.first, name: "Kitchen screen", kind: "kitchen")
    kds.update!(pairing_code: "654321", pairing_expires_at: 10.years.from_now)
    %w[Grill Drinks].each { |n| Station.create!(branch: Branch.first, name: n) }
    4.times { |i| DiningTable.create!(branch: Branch.first, code: "T#{i + 1}", seats: 4, location: "Hall") }
  end
  puts "Demo business: demo@servio.pk / password123, manager PIN 9999, cashier PIN 1111, till pairing code 123456, kitchen pairing code 654321"
end

# Demo stock (Phase 2): runs once per demo business.
if Rails.env.development? && (demo = Business.find_by(name: "Demo Cafe"))
  Tenancy::Context.with(demo) do
    owner = Membership.joins(:role).find_by(roles: { system_key: "owner" })
    Current.membership = owner
    Current.user = owner&.user
    unless StockItem.exists?
      Unit.seed_defaults!
      branch = Branch.first
      kitchen = StockSection.default_for(branch)
      store = StockSection.create!(branch: branch, name: "Warehouse")
      g, kg, ml, l, pcs = %w[g kg ml l pcs].map { |c| Unit.find_by!(code: c) }
      items = {
        chicken: StockItem.create!(name: "Chicken", name_ur: "چکن", sku: "CHK", category: "Meat", base_unit: g, purchase_unit: kg, minimum_qty: 3000),
        buns: StockItem.create!(name: "Burger bun", sku: "BUN", category: "Bakery", base_unit: pcs, minimum_qty: 30),
        oil: StockItem.create!(name: "Cooking oil", sku: "OIL", category: "Grocery", base_unit: ml, purchase_unit: l, minimum_qty: 5000),
        tea: StockItem.create!(name: "Tea leaves", sku: "TEA", category: "Grocery", base_unit: g, purchase_unit: kg, minimum_qty: 500),
        milk: StockItem.create!(name: "Milk", sku: "MLK", category: "Dairy", base_unit: ml, purchase_unit: l, minimum_qty: 4000),
        box: StockItem.create!(name: "Takeaway box", sku: "BOX", category: "Packaging", base_unit: pcs, minimum_qty: 50, is_packaging: true)
      }
      doc = Stock::Posting.create!({ kind: "receive", to_section_id: store.id, invoice_ref: "DEMO-1", note: "Opening stock" }, lines: [
        { stock_item_id: items[:chicken].id, unit_id: kg.id, quantity: 25, unit_cost_minor: 62_000 },
        { stock_item_id: items[:buns].id, unit_id: pcs.id, quantity: 200, unit_cost_minor: 2_500 },
        { stock_item_id: items[:oil].id, unit_id: l.id, quantity: 20, unit_cost_minor: 48_000 },
        { stock_item_id: items[:tea].id, unit_id: kg.id, quantity: 3, unit_cost_minor: 150_000 },
        { stock_item_id: items[:milk].id, unit_id: l.id, quantity: 30, unit_cost_minor: 22_000 },
        { stock_item_id: items[:box].id, unit_id: pcs.id, quantity: 300, unit_cost_minor: 1_500 }
      ], actor: owner, branch: branch)
      Stock::Posting.post!(doc, actor: owner)
      t = Stock::Posting.create!({ kind: "transfer", from_section_id: store.id, to_section_id: kitchen.id }, lines: [
        { stock_item_id: items[:chicken].id, unit_id: kg.id, quantity: 8 }, { stock_item_id: items[:buns].id, quantity: 60 }, { stock_item_id: items[:oil].id, unit_id: l.id, quantity: 5 },
        { stock_item_id: items[:tea].id, unit_id: g.id, quantity: 500 }, { stock_item_id: items[:milk].id, unit_id: l.id, quantity: 10 }, { stock_item_id: items[:box].id, quantity: 100 }
      ], actor: owner, branch: branch)
      Stock::Posting.post!(t, actor: owner)
      puts "Demo stock: 6 items received into Warehouse and transferred to Kitchen"
    end
  end
end

# Demo recipes (Phase 2): once the demo stock exists and a Zinger Burger product exists.
if Rails.env.development? && (demo = Business.find_by(name: "Demo Cafe"))
  Tenancy::Context.with(demo) do
    owner = Membership.joins(:role).find_by(roles: { system_key: "owner" })
    Current.membership = owner
    Current.user = owner&.user
    burger = Product.active.find_by(name: "Zinger Burger")
    if burger && !Recipe.exists? && StockItem.exists?
      g, pcs, ml = %w[g pcs ml].map { |c| Unit.find_by!(code: c) }
      chicken, buns, oil, box = %w[CHK BUN OIL BOX].map { |k| StockItem.find_by!(sku: k) }
      r = Recipe.create!(product: burger, name: "Zinger Burger", yield_qty: 1)
      r.lines.create!(stock_item: chicken, unit: g, quantity: 150, waste_percent: 5, sort_order: 0)
      r.lines.create!(stock_item: buns, unit: pcs, quantity: 1, sort_order: 1)
      r.lines.create!(stock_item: oil, unit: ml, quantity: 30, sort_order: 2)
      Recipes::Costing.recompute!(r)
      PackagingRule.find_or_create_by!(order_type: "takeaway", stock_item: box) { |x| x.quantity = 1 }
      PackagingRule.find_or_create_by!(order_type: "delivery", stock_item: box) { |x| x.quantity = 1 }
      puts "Demo recipe: Zinger Burger costs Rs #{r.cost_minor / 100.0}; takeaway and delivery use one box"
    end
  end
end

# Demo supplier and purchase order (Phase 2).
if Rails.env.development? && (demo = Business.find_by(name: "Demo Cafe"))
  Tenancy::Context.with(demo) do
    owner = Membership.joins(:role).find_by(roles: { system_key: "owner" })
    Current.membership = owner
    Current.user = owner&.user
    if StockItem.exists? && !Supplier.exists?
      metro = Supplier.create!(name: "Metro Cash & Carry", contact_name: "Imran", phone: "+923001234567", payment_terms_days: 15)
      bakery = Supplier.create!(name: "Gourmet Bakers", contact_name: "Sana", phone: "+923217654321", payment_terms_days: 7)
      kg = Unit.find_by!(code: "kg")
      chicken, buns = %w[CHK BUN].map { |k| StockItem.find_by!(sku: k) }
      po = Purchasing::Orders.create!({ supplier_id: metro.id, expected_on: Date.current + 2, note: "Weekly chicken" }, lines: [ { stock_item_id: chicken.id, unit_id: kg.id, quantity: 20, unit_cost_minor: 62_000 } ], actor: owner, branch: Branch.first)
      Purchasing::Orders.send!(po)
      Purchasing::Receipts.create!({ supplier_id: bakery.id, invoice_ref: "GB-1041", received_on: Date.current.to_s }, lines: [ { stock_item_id: buns.id, quantity: 100, unit_cost_minor: 2_500 } ], actor: owner, branch: Branch.first, section: StockSection.default_for(Branch.first))
      puts "Demo purchasing: 2 suppliers, PO-#{po.number} sent to Metro, GRN-1 from Gourmet Bakers (balance Rs #{bakery.reload.balance_minor / 100})"
    end
  end
end

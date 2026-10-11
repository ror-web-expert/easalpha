# Builds a small menu directly in the database for order specs.
module MenuHelpers
  def build_menu!(business, with_tax: true)
    Tenancy::Context.with(business) do
      branch = Branch.first
      tax = with_tax ? TaxRate.create!(name: "PRA 16%", rate: 16, inclusive: false, authority: "pra", is_default: true) : nil
      grill = Station.create!(branch: branch, name: "Grill")
      drinks = Station.create!(branch: branch, name: "Drinks")
      menu = Menu.create!(name: "Main", is_default: true)
      mains = Category.create!(menu: menu, name: "Mains", station_id: grill.id)
      bev = Category.create!(menu: menu, name: "Drinks", station_id: drinks.id)
      burger = Product.create!(category: mains, name: "Zinger Burger", base_price_minor: 45_000, tax_rate: tax)
      burger.product_prices.create!(order_type: "delivery", price_minor: 50_000)
      double = burger.variants.create!(name: "Double", price_minor: 65_000)
      chai = Product.create!(category: bev, name: "Chai", base_price_minor: 8_000, tax_rate: tax)
      spice = ModifierGroup.create!(name: "Spice", min_select: 0, max_select: 1)
      hot = Modifier.create!(modifier_group: spice, name: "Extra hot", price_minor: 2_000)
      burger.product_modifier_groups.create!(modifier_group: spice)
      deal = Deal.create!(name: "Lunch Box", price_minor: 50_000, tax_rate: tax)
      deal.deal_items.create!(product: burger, quantity: 1)
      deal.deal_items.create!(product: chai, quantity: 1)
      { branch: branch, tax: tax, grill: grill, drinks: drinks, menu: menu, burger: burger, double: double, chai: chai, spice: spice, hot: hot, deal: deal }
    end
  end

  def add_member!(business, role_key, pin: nil)
    Tenancy::Context.with(business) do
      m = Membership.create!(user: create(:user), role: Role.find_by!(system_key: role_key), status: "active")
      m.set_pin!(pin) if pin
      m
    end
  end
end

RSpec.configure { |c| c.include MenuHelpers }

module Api
  module V1
    class OnboardingController < BaseController
      before_action -> { require_permission!("settings.manage", "menu.edit") }

      # POST /onboarding/sample_menu  loads a small desi fast-food menu so a new restaurant can try the till at once
      def sample_menu
        read_only_guard!
        raise Api::Errors::Conflict.new("menu.exists", "This business already has products") if Product.where(archived_at: nil).exists?
        menu = Menu.find_or_create_by!(name: "Main menu") { |m| m.is_default = true }
        tax = TaxRate.find_or_create_by!(name: "Sales tax 16%") { |t| t.rate = 16; t.authority = "pra"; t.is_default = true }
        sample = { "Burgers" => [ [ "Zinger Burger", 450 ], [ "Chicken Patty Burger", 250 ], [ "Beef Burger", 550 ] ], "BBQ" => [ [ "Chicken Tikka", 480 ], [ "Malai Boti (6 pcs)", 650 ], [ "Seekh Kabab (4 pcs)", 400 ] ],
                   "Karahi" => [ [ "Chicken Karahi (half)", 1200 ], [ "Chicken Karahi (full)", 2300 ] ], "Rice" => [ [ "Chicken Biryani", 350 ], [ "Plain Rice", 150 ] ],
                   "Drinks" => [ [ "Chai", 80 ], [ "Mineral Water 500ml", 60 ], [ "Cold Drink 345ml", 100 ] ] }
        sample.each do |cat_name, items|
          cat = Category.create!(menu: menu, name: cat_name)
          items.each { |name, price| Product.create!(category: cat, name: name, base_price_minor: price * 100, tax_rate: tax) }
        end
        spice = ModifierGroup.create!(name: "Spice level", min_select: 0, max_select: 1)
        %w[Mild Medium Hot].each_with_index { |n, i| Modifier.create!(modifier_group: spice, name: n, price_minor: 0, sort_order: i) }
        Product.where(category_id: Category.where(name: %w[Karahi BBQ]).select(:id)).find_each { |p| p.product_modifier_groups.create!(modifier_group: spice) }
        SetupChecklistItem.complete!("menu")
        SetupChecklistItem.complete!("tax")
        audit!("create", record: menu, after: { sample_menu: true })
        render json: { menu_id: menu.id, categories: Category.count, products: Product.count }, status: :created
      end

      def status
        items = SetupChecklistItem.order(:sort_order)
        plan_off = current_business.plan&.features&.select { |_, v| v == false }&.keys || []
        render json: { done: items.count { |i| i.done_at }, total: items.size, items: items.map { |i| Serializers.checklist_item(i) }, plan_features_off: plan_off, trial_days_left: current_business.trial_days_left }
      end
    end
  end
end

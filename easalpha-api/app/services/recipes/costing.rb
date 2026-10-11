module Recipes
  # Recipe cost from current average costs, food cost percent against the selling price before tax, coverage and the 10x flag.
  module Costing
    module_function

    def recompute!(recipe)
      total = recipe.lines.includes(:stock_item, :unit).sum(&:cost_minor)
      recipe.update_columns(cost_minor: total, updated_at: Time.current) if recipe.cost_minor != total
      total
    end

    def recompute_all!
      Recipe.active.includes(lines: %i[stock_item unit]).find_each { |r| recompute!(r) }
    end

    # Selling price before tax for a product or variant, using the base price.
    def price_ex_tax_minor(product, variant = nil)
      price = variant ? variant.price_minor : product.base_price_minor
      tax = product.tax_rate
      return price unless tax&.inclusive
      (price / (1 + tax.rate.to_d / 100)).round
    end

    def food_cost(recipe)
      return nil unless recipe.product
      price = price_ex_tax_minor(recipe.product, recipe.variant)
      cost = recipe.unit_cost_minor
      percent = price.positive? ? (cost.to_d * 100 / price).round(1).to_f : nil
      target = InventorySetting.current.food_cost_target_percent.to_f
      { cost_minor: cost, price_ex_tax_minor: price, percent: percent, target_percent: target, over_target: percent ? percent > target : false }
    end

    def coverage
      products = Product.active.includes(:variants).to_a
      with = Recipe.active.for_products.pluck(:product_id).to_set
      missing = products.reject { |p| with.include?(p.id) }
      { products: products.size, with_recipe: products.size - missing.size, percent: products.empty? ? 100.0 : ((products.size - missing.size) * 100.0 / products.size).round(1),
        missing: missing.map { |p| { id: p.id, name: p.name, category_id: p.category_id } } }
    end

    # Lines using more than 10x the typical amount of the same ingredient across recipes: a probable wrong-unit recipe.
    def flags
      lines = RecipeLine.includes(:stock_item, :recipe, :unit).joins(:recipe).merge(Recipe.active).to_a
      by_item = lines.group_by(&:stock_item_id)
      by_item.flat_map do |_, ls|
        next [] if ls.size < 2
        sorted = ls.map(&:base_quantity).sort
        median = sorted[(sorted.size - 1) / 2]
        ls.select { |l| median.positive? && l.base_quantity > median * 10 }.map do |l|
          { recipe_id: l.recipe_id, recipe: l.recipe.name, stock_item_id: l.stock_item_id, item: l.stock_item.name, quantity: l.base_quantity.to_s, typical: median.to_s, unit: l.stock_item.base_unit.code,
            message: "#{l.recipe.name} uses #{l.quantity.to_s('F')} #{l.unit.code} of #{l.stock_item.name}; other recipes use about #{median.to_s('F')} #{l.stock_item.base_unit.code}. Check the unit." }
        end
      end
    end
  end
end

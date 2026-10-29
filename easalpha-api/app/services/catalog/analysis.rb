module Catalog
  # Product Analysis: what one serving earns at today's average costs. The ingredient cost comes from the recipe (a
  # variant's own, else the product's shared one); every order type adds its consumables from the Order Inventory tab
  # (boxes, bags, fuel) and sells at that order type's price. Profit and margin are on the price before tax, because the
  # tax is not the shop's money.
  module Analysis
    module_function

    def for_product(product, branch_id: nil)
      recipes = Recipe.active.for_products.where(product_id: product.id).includes(lines: %i[stock_item unit]).to_a
      shared = recipes.find { |r| r.variant_id.nil? }
      consumables = OrderTypeConsumable.where(product_id: product.id).includes(:stock_item, :unit).to_a
      target = target_percent
      subjects = product.variants.any? ? product.variants.map { |v| [ v, recipes.find { |r| r.variant_id == v.id } || shared ] } : [ [ nil, shared ] ]
      { product: { id: product.id, name: product.name, image_key: product.image_key, category_id: product.category_id, base_price_minor: product.base_price_minor },
        target_percent: target,
        variants: subjects.map { |variant, recipe| block(product, variant, recipe, consumables, target, branch_id) } }
    end

    # The catalogue's margin badge, one figure per product: the same block the analysis opens on (the first variant, or
    # the base product), costed by its own recipe or the product's shared one.
    def costs_for(products)
      ids = products.map(&:id)
      return {} if ids.empty?
      recipes = Recipe.active.for_products.where(product_id: ids).to_a.group_by(&:product_id)
      target = target_percent
      products.each_with_object({}) do |p, out|
        rs = recipes[p.id] or next
        variant = p.variants.first
        recipe = (variant && rs.find { |r| r.variant_id == variant.id }) || rs.find { |r| r.variant_id.nil? }
        next unless recipe
        f = figures(variant ? variant.price_minor : p.base_price_minor, p.tax_rate, recipe.unit_cost_minor, 0, target)
        out[p.id] = { cost_minor: f[:ingredient_cost_minor], margin_percent: f[:margin_percent], food_cost_percent: f[:food_cost_percent], over_target: f[:over_target], variant_name: variant&.name }
      end
    end

    def block(product, variant, recipe, consumables, target, branch_id)
      price = variant ? variant.price_minor : product.base_price_minor
      cost = recipe&.unit_cost_minor
      per = recipe ? recipe.yield_qty : 1
      lines = recipe ? recipe.lines.map { |l| { item_name: l.stock_item.name, quantity: (l.quantity / per).round(3).to_s("F"), unit_code: l.unit.code, waste_percent: l.waste_percent.to_f, cost_minor: (l.cost_minor / per).round } } : []
      order_types = Product::ORDER_TYPES.map do |ot|
        rows = consumables.select { |c| c.order_type == ot && c.variant_id == variant&.id }
        rows = consumables.select { |c| c.order_type == ot && c.variant_id.nil? } if rows.empty? && variant
        items = rows.map { |c| { item_name: c.stock_item.name, quantity: c.quantity.to_s("F"), unit_code: c.unit.code, cost_minor: (c.base_quantity * c.stock_item.avg_cost_minor_per_base).round } }
        extra = items.sum { |i| i[:cost_minor] }
        { order_type: ot, consumables: items, **figures(product.price_for(order_type: ot, variant: variant, branch_id: branch_id), product.tax_rate, cost, extra, target) }
      end
      { variant_id: variant&.id, name: variant&.name || "Base product", recipe: recipe && { id: recipe.id, name: recipe.name, yield_qty: recipe.yield_qty.to_s("F") },
        lines: lines, **figures(price, product.tax_rate, cost, 0, target), order_types: order_types }
    end

    def figures(price, tax_rate, cost, extra, target)
      ex_tax = Recipes::Costing.ex_tax_minor(price, tax_rate)
      total = cost && cost + extra
      profit = total && ex_tax - total
      margin = (profit && ex_tax.positive?) ? (profit.to_d * 100 / ex_tax).round(1).to_f : nil
      food = (cost && ex_tax.positive?) ? (cost.to_d * 100 / ex_tax).round(1).to_f : nil
      { price_minor: price, price_ex_tax_minor: ex_tax, ingredient_cost_minor: cost, extra_cost_minor: extra, total_cost_minor: total, profit_minor: profit,
        margin_percent: margin, food_cost_percent: food, over_target: food ? food > target : false }
    end

    def target_percent = InventorySetting.current.food_cost_target_percent.to_f
  end
end

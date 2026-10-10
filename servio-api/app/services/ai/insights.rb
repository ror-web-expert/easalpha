module Ai
  # SPEC AI Pricing Analysis and AI Stock Forecast: advisory layers over the same data. A scheduled job builds the
  # aggregates and stores the suggestions; the rules engine runs without any external service, and an LLM can be
  # plugged in behind the same payload later.
  module Insights
    module_function

    def pricing!(branch:, from: Date.current - 30, to: Date.current)
      sales = Reports::Sales.new(branch: branch, from: from, to: to)
      items = sales.items(limit: 500)
      total_rev = items.sum { |r| r[:revenue_minor] }
      products = Product.unscope(where: :archived_at).where(id: items.map { |r| r[:product_id] }.compact).index_by(&:id)
      costs = Recipe.where(product_id: products.keys, variant_id: nil).index_by(&:product_id)
      rows = items.map do |r|
        p = r[:product_id] && products[r[:product_id]]
        price = p&.base_price_minor.to_i
        cost = (c = r[:product_id] && costs[r[:product_id]]) ? c.cost_minor.to_i : nil
        margin = price.positive? && cost ? ((price - cost) * 100.0 / price).round(1) : nil
        share = total_rev.zero? ? 0 : (r[:revenue_minor] * 100.0 / total_rev).round(1)
        suggestion, reason = suggest(price: price, cost: cost, margin: margin, share: share, discount: r[:discount_minor], revenue: r[:revenue_minor])
        { product_id: r[:product_id], name: r[:name], quantity: r[:quantity], revenue_minor: r[:revenue_minor], revenue_share: share, price_minor: price, cost_minor: cost, margin_percent: margin, discount_minor: r[:discount_minor],
          suggestion: suggestion, reason: reason, suggested_price_minor: suggestion == "raise_price" ? (price * 1.08 / 100).round * 100 : nil }
      end.reject { |r| r[:suggestion] == "ok" }.sort_by { |r| -r[:revenue_minor] }
      payload = { from: from, to: to, rows: rows.first(50),
                  summary: { items_reviewed: items.size, flagged: rows.size, underpriced: rows.count { |r| r[:suggestion] == "raise_price" }, promote: rows.count { |r| r[:suggestion] == "promote" },
                             review_cost: rows.count { |r| r[:suggestion] == "review_cost" },
                             revenue_opportunity_minor: rows.sum { |r| r[:suggested_price_minor] ? ((r[:suggested_price_minor] - r[:price_minor]) * r[:quantity]).round : 0 } } }
      AiInsight.create!(branch_id: branch.id, kind: "pricing", from_date: from, to_date: to, payload: payload, engine: "rules", generated_at: Time.current)
    end

    def suggest(price:, cost:, margin:, share:, discount:, revenue:)
      return ["review_cost", "No recipe cost; margin unknown"] if cost.nil? && price.positive?
      return ["review_cost", "Cost is above the price: selling at a loss"] if margin && margin.negative?
      return ["raise_price", "High volume with a thin margin (#{margin}%): a small increase is low risk"] if margin && margin < 35 && share >= 3
      if revenue.positive? && discount * 100.0 / (revenue + discount) > 25 && share >= 3
        return ["raise_price", "Popular item discounted #{(discount * 100.0 / (revenue + discount)).round}% of the time: demand supports the list price"]
      end
      return ["promote", "Strong margin (#{margin}%) but little volume: a promotion or deal placement could lift it"] if margin && margin > 70 && share < 1
      ["ok", nil]
    end

    def stock_forecast!(branch:, forecast_days: 7)
      f = Purchasing::Demand.forecast(branch: branch, lookback_days: 30, forecast_days: forecast_days)
      rows = f[:rows].map do |r|
        urgency = r[:days_left].nil? ? "ok" : (r[:days_left] <= 2 ? "critical" : (r[:days_left] <= forecast_days ? "soon" : "ok"))
        r.merge(urgency: urgency, note: urgency == "critical" ? "Runs out within 2 days at the current pace" : (urgency == "soon" ? "Order before the forecast window ends" : "Covered for the window"))
      end
      payload = f.merge(rows: rows, summary: { items: rows.size, critical: rows.count { |r| r[:urgency] == "critical" }, soon: rows.count { |r| r[:urgency] == "soon" }, est_cost_minor: f[:total_cost_minor] })
      AiInsight.create!(branch_id: branch.id, kind: "stock_forecast", from_date: Date.current - 30, to_date: Date.current + forecast_days, payload: payload, engine: "rules", generated_at: Time.current)
    end

    def latest(kind, branch:) = AiInsight.where(kind: kind, branch_id: branch.id).order(generated_at: :desc).first
  end
end

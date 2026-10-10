module Campaigns
  # Resolves a campaign segment to customers who can be messaged: opted in, not opted out, with a phone.
  module Segments
    module_function

    def customers(segment)
      scope = Customer.active.where(is_walk_in: false).where.not(phone: [nil, ""])
      p = segment.with_indifferent_access
      case p[:kind].to_s
      when "group" then scope = scope.where(group_id: p[:group_id])
      when "inactive" then scope = scope.where("last_order_at < ? OR (last_order_at IS NULL AND created_at < ?)", (p[:days] || 30).to_i.days.ago, (p[:days] || 30).to_i.days.ago)
      when "birthday_month" then scope = scope.where("EXTRACT(MONTH FROM birthday) = ?", (p[:month] || Date.current.month).to_i)
      when "top_spenders" then scope = scope.order(net_spent_minor: :desc).limit((p[:limit] || 50).to_i)
      when "khata_due" then scope = scope.where("balance_minor > 0")
      end
      scope
    end

    def audience(segment)
      all = customers(segment)
      reachable = all.where(whatsapp_opt_in: true, opted_out_at: nil)
      { total: all.count, reachable: reachable.count, not_opted_in: all.count - reachable.count }
    end

    def reachable(segment) = customers(segment).where(whatsapp_opt_in: true, opted_out_at: nil)
  end
end

module Reports
  # Commission per staff member from the active rules: order takers, waiters, cashiers and riders.
  module Commissions
    module_function

    def run(branch:, from:, to:)
      orders = Order.where(branch_id: branch.id, business_day: from..to, status: %w[paid closed]).includes(:items)
      rules = CommissionRule.active.to_a
      people = {}
      add = lambda do |membership_id, role, order|
        next unless membership_id
        p = people[[membership_id, role]] ||= { membership_id: membership_id, applies_to: role, orders: 0, items: 0, sales_minor: 0 }
        p[:orders] += 1
        p[:items] += order.items.count { |i| i.status != "cancelled" }
        p[:sales_minor] += order.total_minor
      end
      orders.each do |o|
        add.call(o.taken_by_membership_id, "order_taker", o)
        add.call(o.waiter_membership_id, "waiter", o)
        add.call(o.completed_by_membership_id, "cashier", o)
        add.call(o.rider_id && Rider.find_by(id: o.rider_id)&.membership_id, "rider", o)
      end
      members = Membership.where(id: people.keys.map(&:first).uniq).includes(:user, :role).index_by(&:id)
      rows = people.values.map do |p|
        m = members[p[:membership_id]] or next
        applicable = rules.select { |r| r.applies_to == p[:applies_to] && r.matches?(m) }
        commission = applicable.sum { |r| r.amount_for(sales_minor: p[:sales_minor], orders: p[:orders], items: p[:items]) }
        p.merge(name: m.user.name, role: m.role.name, rules: applicable.map(&:name), commission_minor: commission)
      end.compact.sort_by { |r| -r[:commission_minor] }
      { from: from, to: to, rows: rows, total_commission_minor: rows.sum { |r| r[:commission_minor] } }
    end
  end
end

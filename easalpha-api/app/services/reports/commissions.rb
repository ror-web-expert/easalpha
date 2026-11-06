module Reports
  # Commission per staff member from the active rules: order takers, waiters, cashiers and riders.
  module Commissions
    module_function

    ROLES = { "order_taker" => :taken_by_membership_id, "waiter" => :waiter_membership_id, "cashier" => :completed_by_membership_id, "rider" => :rider_id }.freeze

    def run(branch:, from:, to:)
      # Sales by the one revenue rule (Reports::Revenue): an order's total on its day, a refund off it on the refund's
      # day, so a refund made later comes off the period it was made in. Per-order and per-item rules count the
      # orders that stood: paid or closed, neither refunded nor a staff meal (whose lines carry prices it never charged).
      period = Revenue.period(branch: branch, from: from, to: to)
      counted = period.orders.where(status: %w[paid closed]).includes(:items).to_a
      sales = ROLES.transform_values { |column| period.grouped(column) }
      riders = Rider.where(id: (sales["rider"].keys + counted.map(&:rider_id)).compact.uniq).pluck(:id, :membership_id).to_h
      people = {}
      person = ->(mid, role) { people[[ mid, role ]] ||= { membership_id: mid, applies_to: role, orders: 0, items: 0, sales_minor: 0 } }
      ROLES.each do |role, column|
        member = ->(value) { role == "rider" ? riders[value] : value }
        sales[role].each do |value, r|
          mid = member.call(value) or next
          person.call(mid, role)[:sales_minor] += r[:revenue_minor]
        end
        counted.each do |o|
          mid = member.call(o.public_send(column)) or next
          p = person.call(mid, role)
          p[:orders] += 1
          p[:items] += o.items.count { |i| i.status != "cancelled" }
        end
      end
      rules = CommissionRule.active.to_a
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

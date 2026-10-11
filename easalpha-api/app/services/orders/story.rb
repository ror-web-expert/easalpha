module Orders
  # SPEC "order story": who punched, reopened, edited, completed or cancelled an order, each stamped with user, role and
  # time, and for an edit the item diff and the money diff (for example + Cold Drink × 1, amount due 980 → 1230).
  module Story
    module_function

    def record!(order, type, actor: nil, device: nil, diff: nil, amount_before: nil, amount_after: nil, note: nil)
      OrderEvent.create!(
        order: order, business_id: order.business_id, event_type: type, membership_id: actor&.id,
        user_name: actor&.user&.name, role_name: actor&.role&.name, device_id: device&.id,
        diff: diff, amount_before: amount_before, amount_after: amount_after, note: note, occurred_at: Time.current
      )
    end

    def snapshot(order)
      order.items.reject(&:cancelled?).map { |i| { id: i.id, name: i.name_snapshot, quantity: i.quantity.to_d, line_total_minor: i.line_total_minor } }
    end

    # Item diff between two snapshots: added, removed, and quantity changes.
    def diff(before, after)
      b = before.index_by { |i| i[:id] }
      a = after.index_by { |i| i[:id] }
      {
        added: (a.keys - b.keys).map { |id| { name: a[id][:name], quantity: a[id][:quantity].to_s("F") } },
        removed: (b.keys - a.keys).map { |id| { name: b[id][:name], quantity: b[id][:quantity].to_s("F") } },
        changed: (a.keys & b.keys).filter_map { |id| a[id][:quantity] != b[id][:quantity] ? { name: a[id][:name], from: b[id][:quantity].to_s("F"), to: a[id][:quantity].to_s("F") } : nil }
      }
    end

    def empty_diff?(d) = d.values.all?(&:empty?)

    # The story block for the order detail: the three names the SPEC shows, the counts, and the timeline.
    def for(order)
      events = order.story_events.to_a
      names = Membership.where(id: [ order.taken_by_membership_id, order.completed_by_membership_id ].compact).includes(:user).index_by(&:id)
      collected = order.payments.where(status: "captured").order(:created_at).last
      collector = collected && Membership.where(id: collected.received_by_membership_id).includes(:user).first
      {
        punched_by: names[order.taken_by_membership_id]&.user&.name, completed_by: names[order.completed_by_membership_id]&.user&.name,
        collected_by: collector&.user&.name, reopen_count: order.reopen_count, edit_count: order.edit_count,
        events: events.map { |e| { id: e.id, type: e.event_type, user: e.user_name, role: e.role_name, at: e.occurred_at, diff: e.diff, amount_before: e.amount_before, amount_after: e.amount_after, note: e.note } }
      }
    end
  end
end

module Kitchen
  # Groups order items by station and writes one ticket per station. A ticket is what the KDS shows and the printer prints.
  module Tickets
    module_function

    def create_for!(order, kind:, items:)
      groups = items.group_by { |i| i.station_id }
      groups.each do |station_id, lines|
        KitchenTicket.create!(
          order: order, branch_id: order.branch_id, station_id: station_id, kind: kind, serial: order.serial, order_type: order.order_type,
          table_code: order.dining_table&.code,
          lines: lines.map { |i| line_payload(i) }
        )
      end
      Realtime.kitchen_changed(order.branch_id, order.business_id)
    end

    def line_payload(i)
      { order_item_id: i.id, name: i.name_snapshot, quantity: i.quantity.to_s("F"), notes: i.notes, course: i.course,
        modifiers: i.modifiers.map { |m| "#{m.name_snapshot}#{m.quantity > 1 ? " x#{m.quantity.to_i}" : ''}" },
        components: i.deal_components.map { |c| "#{c['quantity']}x #{c['name']}" } }
    end
  end
end

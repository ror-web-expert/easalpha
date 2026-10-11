# Action Cable broadcasts. Streams are per business and branch so one restaurant never sees another's orders.
module Realtime
  module_function

  def order_changed(order)
    ActionCable.server.broadcast("orders:#{order.business_id}:#{order.branch_id}", { type: "order", order: OrderSerializers.summary(order) })
    kitchen_changed(order.branch_id, order.business_id)
  rescue StandardError => e
    Rails.logger.warn("[realtime] #{e.class}: #{e.message}")
  end

  def kitchen_changed(branch_id, business_id)
    ActionCable.server.broadcast("kitchen:#{business_id}:#{branch_id}", { type: "refresh", at: Time.current })
  rescue StandardError => e
    Rails.logger.warn("[realtime] #{e.class}: #{e.message}")
  end

  def token_ready(order)
    ActionCable.server.broadcast("tokens:#{order.business_id}:#{order.branch_id}", { type: "ready", serial: order.serial, label: order.label, order_type: order.order_type })
  rescue StandardError => e
    Rails.logger.warn("[realtime] #{e.class}: #{e.message}")
  end
end

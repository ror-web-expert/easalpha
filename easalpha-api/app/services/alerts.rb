# Owner alerts for events over a set limit: big voids now, cash short in shifts, low stock in Phase 2.
module Alerts
  module_function

  def big_void(order, reason:, approver:)
    threshold = (order.business.setting("big_void_alert_minor") || 500_000).to_i
    return if order.total_minor < threshold
    who = approver ? Membership.unscoped.includes(:user).find_by(id: approver.id)&.user&.name : "cashier"
    Notification.create!(kind: "big_void", title: "Void of Rs #{order.total_minor / 100} on #{order.label}", body: "#{reason}, approved by #{who}", link: "/orders/#{order.id}")
    Membership.active.joins(:role).where(roles: { system_key: "owner" }).includes(:user).each do |m|
      Whatsapp::Sender.deliver(phone: m.user.phone, template: "alert_big_void", variables: { amount: order.total_minor / 100, reason: reason, approver: who, order_label: order.label }) if m.user.phone.present?
    end
  rescue StandardError => e
    Rails.logger.warn("[alerts] big_void failed: #{e.message}")
  end

  # SPEC Stock Alerts: once per item and day when a level reaches its minimum (setting inventory.stock_alerts.low_stock).
  def low_stock(item, qty)
    return unless Current.business&.setting("inventory.stock_alerts.low_stock")
    link = "/inventory/items/#{item.id}"
    return if Notification.where(kind: "low_stock", link: link).where("created_at > ?", 24.hours.ago).exists?
    Notification.create!(kind: "low_stock", title: "#{item.name} is at its minimum", body: "On hand #{qty.to_s('F')} #{item.base_unit.code}, minimum #{item.minimum_qty.to_s('F')}. See Demand for what to order.", link: link)
  rescue StandardError => e
    Rails.logger.warn("[alerts] low_stock failed: #{e.message}")
  end

  # Once per item, section and day when a level goes below zero. Creates a manager task in the notification centre.
  def negative_stock(item, section, qty)
    link = "/stock/items/#{item.id}"
    return if Notification.where(kind: "negative_stock", link: link).where("created_at > ?", 24.hours.ago).exists?
    Notification.create!(kind: "negative_stock", title: "#{item.name} is below zero in #{section.name}", body: "On hand #{qty.to_s('F')} #{item.base_unit.code}. Count the section or receive stock.", link: link)
  rescue StandardError => e
    Rails.logger.warn("[alerts] negative_stock failed: #{e.message}")
  end
end

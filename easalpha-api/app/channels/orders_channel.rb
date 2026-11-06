# The till's live feed: an order changed, a QR guest called the waiter or asked for the bill. Its order summaries
# carry customers' names, phones and storefront guests' delivery addresses, so only a session that takes orders hears
# it (as GET /qr_orders), at a till or tablet or in the admin; never a device token alone, nor a kitchen, token or
# queue screen, a rider's phone or a kiosk (final round, sync-auth#9).
class OrdersChannel < ApplicationCable::Channel
  def self.allowed?(principal) = member_with?(principal, %w[orders.create kitchen.view]) && on_device?(principal, %w[till tablet])

  def subscribed = listen("orders")
end

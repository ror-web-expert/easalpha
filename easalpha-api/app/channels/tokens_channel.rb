# "Order 59 is ready" for the token and queue screens (serial, label and order type only): a token or kitchen screen, a
# till or tablet whose customer-facing window reads GET /kitchen/ready with the device's own token (KitchenController),
# or a session with the kitchen lists' permissions in the admin or on one of those screens.
class TokensChannel < ApplicationCable::Channel
  SCREENS = %w[token_screen kitchen till tablet].freeze

  def self.allowed?(principal)
    return principal[:device_kind].in?(SCREENS) if principal[:membership_id].blank?
    member_with?(principal, %w[kitchen.view kitchen.bump orders.create]) && on_device?(principal, SCREENS)
  end

  def subscribed = listen("tokens")
end

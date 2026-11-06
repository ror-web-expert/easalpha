# The kitchen display's nudge to load its tickets again (no order data in it): a kitchen screen, or a session with the
# kitchen display's permissions (KitchenController) in the admin or on a till, tablet or kitchen screen.
class KitchenChannel < ApplicationCable::Channel
  SCREENS = %w[kitchen till tablet].freeze

  def self.allowed?(principal)
    return principal[:device_kind] == "kitchen" if principal[:membership_id].blank?
    member_with?(principal, %w[kitchen.view kitchen.bump orders.create]) && on_device?(principal, SCREENS)
  end

  def subscribed = listen("kitchen")
end

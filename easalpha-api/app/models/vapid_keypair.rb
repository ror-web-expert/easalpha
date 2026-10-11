# The installation's VAPID keys for Web Push. Supplied through VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, else generated
# once and kept here so subscriptions keep working across restarts.
class VapidKeypair < ApplicationRecord
  def self.current
    if ENV["VAPID_PUBLIC_KEY"].present? && ENV["VAPID_PRIVATE_KEY"].present?
      return new(public_key: ENV["VAPID_PUBLIC_KEY"], private_key: ENV["VAPID_PRIVATE_KEY"])
    end
    first || begin
      k = WebPush.generate_key
      create!(public_key: k.public_key, private_key: k.private_key)
    end
  end
end

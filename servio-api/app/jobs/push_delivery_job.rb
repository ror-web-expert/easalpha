# Sends one Web Push message. Gone subscriptions (404, 410) are removed; repeated failures remove the subscription too.
class PushDeliveryJob < ApplicationJob
  queue_as :messages

  def perform(subscription_id, payload)
    Tenancy::Context.unscoped do
      sub = PushSubscription.find_by(id: subscription_id) or return
      keys = VapidKeypair.current
      WebPush.payload_send(message: payload.to_json, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, ttl: 3600, urgency: "high",
                           vapid: { subject: ENV.fetch("VAPID_SUBJECT", "mailto:support@easalpha.com"), public_key: keys.public_key, private_key: keys.private_key })
      sub.update_columns(last_used_at: Time.current, failed_count: 0)
    rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
      sub&.destroy
    rescue StandardError => e
      Rails.logger.warn("[push] #{e.class}: #{e.message}")
      return unless sub
      sub.failed_count >= 4 ? sub.destroy : sub.increment!(:failed_count)
    end
  end
end

module Push
  # Browser push for the admin panel, POS, kitchen display and rider app. Alerts arrive even when the tab is closed.
  # Every in-app notification becomes a push to the members who should see it, when the Notifications settings allow it.
  module Notifier
    module_function

    # notification kind => [settings key that may switch it off, who gets it]
    ROUTES = {
      "low_stock" => [ "notifications.low_stock", :managers ], "negative_stock" => [ "notifications.low_stock", :managers ],
      "cash_short" => [ "notifications.cash_short", :managers ], "big_void" => [ "notifications.big_void", :managers ],
      "daily_summary" => [ "notifications.daily_summary", :managers ], "qr_order" => [ "notifications.new_online_order", :tills ],
      "online_order" => [ "notifications.new_online_order", :tills ], "preorder_due" => [ "notifications.new_online_order", :tills ],
      "pending_customer" => [ "notifications.pending_customers", :managers ]
    }.freeze
    MANAGER_CODES = %w[settings.manage reports.view_all staff.manage finance.view].freeze

    def from_notification(n)
      key, audience = ROUTES[n.kind] || [ nil, :managers ]
      business = Business.find_by(id: n.business_id) or return
      return if key && !ActiveModel::Type::Boolean.new.cast(business.setting(key))
      subs = case audience
      when :tills then PushSubscription.where(app: %w[pos kitchen]).or(PushSubscription.where(membership_id: manager_ids))
      else PushSubscription.where(membership_id: manager_ids)
      end
      deliver(subs, title: n.title, body: n.body, url: admin_url(n.link), kind: n.kind, tag: n.kind)
    end

    def manager_ids = Membership.active.includes(:role).select { |m| MANAGER_CODES.any? { |c| m.can?(c) } }.map(&:id)

    def to_memberships(ids, title:, body:, url:, kind:, apps: nil)
      subs = PushSubscription.where(membership_id: ids)
      subs = subs.where(app: apps) if apps
      deliver(subs, title: title, body: body, url: url, kind: kind, tag: kind)
    end

    def deliver(subs, title:, body:, url:, kind:, tag: nil)
      payload = { title: title.to_s[0, 120], body: body.to_s[0, 240], url: url, kind: kind, tag: tag, icon: "/icon-192.png" }
      count = 0
      subs.find_each do |s|
        PushDeliveryJob.perform_later(s.id, payload)
        count += 1
      end
      count
    rescue StandardError => e
      Rails.logger.warn("[push] enqueue failed: #{e.message}")
      0
    end

    # Admin notifications link to the old admin paths; the sidebar redirects keep them working.
    def admin_url(link) = link.to_s.start_with?("/admin") || link.blank? ? (link.presence || "/admin") : "/admin#{link}"
  end
end

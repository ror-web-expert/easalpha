# Every 10 minutes: pre-orders due within two hours are pushed to the kitchen screen and the owner is told.
class PreorderDueJob < ApplicationJob
  queue_as :messages

  def perform
    due = Tenancy::Context.unscoped { Order.where(preorder_notified_at: nil).where.not(scheduled_for: nil).where("scheduled_for <= ?", 2.hours.from_now).where(status: Order::OPEN_STATUSES).pluck(:business_id).uniq }
    due.each do |bid|
      within_business(bid) do
        Order.where(preorder_notified_at: nil).where.not(scheduled_for: nil).where("scheduled_for <= ?", 2.hours.from_now).where(status: Order::OPEN_STATUSES).find_each do |o|
          o.update_columns(preorder_notified_at: Time.current)
          Notification.create!(kind: "preorder_due", title: "Pre-order #{o.label} is due at #{o.scheduled_for.in_time_zone(o.branch.time_zone).strftime('%I:%M %p')}", body: o.guest_name.to_s, link: "/orders/#{o.id}")
          Realtime.order_changed(o)
        end
      end
    end
  end
end

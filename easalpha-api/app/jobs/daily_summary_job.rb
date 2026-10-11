# Sends the owner a WhatsApp summary at day end (or 11 pm) and leaves a notification in the panel.
class DailySummaryJob < ApplicationJob
  queue_as :messages

  def perform(business_id, business_day = nil)
    within_business(business_id) do |business|
      Branch.active.find_each do |branch|
        day = business_day ? Date.parse(business_day.to_s) : branch.business_day_for(Time.current) - 1
        summary = Shifts::DayCloser.summarise(branch, day)
        next if summary[:orders].zero?
        text = "#{branch.name} #{day}: #{summary[:paid]} orders, net Rs #{summary[:net_sales_minor] / 100}, discounts Rs #{summary[:discount_minor] / 100}, refunds Rs #{summary[:refunds_minor] / 100}, voids #{summary[:voided]}"
        Notification.create!(kind: "daily_summary", title: "Daily summary for #{day}", body: text, link: "/reports?day=#{day}")
        Membership.active.joins(:role).where(roles: { system_key: "owner" }).includes(:user).each do |m|
          Whatsapp::Sender.deliver(phone: m.user.phone, template: "daily_summary", variables: { business_name: business.name, branch: branch.name, day: day.to_s, summary: text }) if m.user.phone.present?
        end
      end
    end
  end
end

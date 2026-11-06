# Daily: for every business with customer accounts on, a WhatsApp reminder to each customer whose bill is the set
# number of days past its due date and still owed (Customers::Overdue.remind!). One reminder per customer per bill.
class OverdueRemindersJob < ApplicationJob
  queue_as :messages

  def perform
    Tenancy::Context.unscoped { Business.where.not(status: "deleted").pluck(:id) }.each do |id|
      business = Tenancy::Context.unscoped { Business.find(id) }
      Tenancy::Context.with(business) do
        branch = Branch.active.order(is_main: :desc).first or next
        Customers::Overdue.remind!(business, today: branch.business_day_for(Time.current))
      end
    rescue StandardError => e
      Rails.logger.error("[overdue reminders] #{id}: #{e.class} #{e.message}")
    end
  end
end

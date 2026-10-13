# Daily: for every business with customer accounts and monthly bills switched on, sends last month's bills from the
# chosen day of the month on (Customers::Bills.monthly!). A business is skipped once its run for the period is done; a
# day missed is caught up the next day, and a run cut short is carried on.
class MonthlyBillsJob < ApplicationJob
  queue_as :messages

  def perform
    Tenancy::Context.unscoped { Business.where.not(status: "deleted").pluck(:id) }.each do |id|
      business = Tenancy::Context.unscoped { Business.find(id) }
      Tenancy::Context.with(business) do
        branch = Branch.active.order(is_main: :desc).first or next
        Customers::Bills.monthly!(business, today: branch.business_day_for(Time.current))
      end
    rescue StandardError => e
      Rails.logger.error("[monthly bills] #{id}: #{e.class} #{e.message}")
    end
  end
end

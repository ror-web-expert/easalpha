# Daily: for every business with customer accounts and monthly bills switched on, sends last month's bills on the
# chosen day of the month (Customers::Bills.monthly!). A business is skipped when its run for the period exists.
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

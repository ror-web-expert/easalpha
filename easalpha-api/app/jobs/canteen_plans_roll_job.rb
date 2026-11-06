# Daily, before breakfast: for every business with the canteen on and canteen.plans.auto_copy left on, publishes today's
# meal plans from yesterday's published ones wherever today has none (Canteen::Plans.roll_forward!). Running it again
# changes nothing: a session that already has a plan for the day is skipped.
class CanteenPlansRollJob < ApplicationJob
  queue_as :default

  def perform
    Tenancy::Context.unscoped { Business.where.not(status: "deleted").pluck(:id) }.each do |id|
      business = Tenancy::Context.unscoped { Business.find(id) }
      Tenancy::Context.with(business) do
        next unless BusinessModules.on?(business, "canteen") && business.setting("canteen.plans.auto_copy") != false
        Branch.active.find_each { |b| Canteen::Plans.roll_forward!(branch: b, date: b.business_day_for(Time.current)) }
      end
    rescue StandardError => e
      Rails.logger.error("[canteen plans] #{id}: #{e.class} #{e.message}")
    end
  end
end

# Every 15 minutes: for every business with the canteen on and canteen.plans.auto_copy left on, publishes each branch's
# meal plans for that branch's current business day from its latest published ones wherever the day has none
# (Canteen::Plans.roll_forward!). Each branch rolls by its own clock and day end, soon after its day begins: a single
# run at 04:00 Karachi time came before the day began at a branch in another zone or with a later day end, and that
# branch rolled nothing (6 Nov 2026 review). A branch's day is rolled once (a document_counters marker), so a plan
# someone deleted for the day is not brought back by the next run; running the job again changes nothing.
class CanteenPlansRollJob < ApplicationJob
  queue_as :default

  def perform
    at = Time.current
    Tenancy::Context.unscoped { Business.where.not(status: "deleted").pluck(:id) }.each do |id|
      business = Tenancy::Context.unscoped { Business.find(id) }
      Tenancy::Context.with(business) do
        next unless BusinessModules.on?(business, "canteen") && business.setting("canteen.plans.auto_copy") != false
        Branch.active.find_each { |b| roll_day(business, b, b.business_day_for(at)) }
      end
    rescue StandardError => e
      Rails.logger.error("[canteen plans] #{id}: #{e.class} #{e.message}")
    end
  end

  private

  def roll_day(business, branch, day)
    kind = "canteen_plans_roll:#{branch.id}:#{day}"
    return if DocumentCounter.exists?(business_id: business.id, kind: kind)
    DocumentCounter.transaction do
      Canteen::Plans.roll_forward!(branch: branch, date: day) if DocumentCounter.next!(kind, business_id: business.id) == 1
    end
  end
end

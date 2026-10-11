# Every 10 minutes (config/recurring.yml): re-deducts completed orders whose stock deduction was lost, per business.
class StockSafetyNetJob < ApplicationJob
  queue_as :default

  def perform(business_id = nil)
    scope = business_id ? Business.where(id: business_id) : Business.where.not(status: "deleted")
    scope.find_each do |business|
      Tenancy::Context.with(business) { Stock::SafetyNet.sweep! }
    rescue StandardError => e
      Rails.logger.error("[safety-net] #{business.id}: #{e.class} #{e.message}")
    end
  end
end

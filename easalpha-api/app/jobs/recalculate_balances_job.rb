# Rebuilds every cached balance from its ledger (SPEC RecalculateBalancesJob). Nightly, and on demand from the admin.
class RecalculateBalancesJob < ApplicationJob
  queue_as :default

  def perform(business_id = nil)
    scope = business_id ? Business.where(id: business_id) : Business.where.not(status: "deleted")
    scope.find_each do |business|
      Tenancy::Context.with(business) { Balances::Rebuild.all! }
    rescue StandardError => e
      Rails.logger.error("[rebuild] #{business.id}: #{e.class} #{e.message}")
    end
  end
end

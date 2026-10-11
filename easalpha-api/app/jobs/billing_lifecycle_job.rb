class BillingLifecycleJob < ApplicationJob
  queue_as :default

  def perform(business_id = nil)
    scope = business_id ? Business.where(id: business_id) : Business.where.not(status: "deleted")
    scope.find_each { |b| Billing::Lifecycle.run_for(b) }
  end
end

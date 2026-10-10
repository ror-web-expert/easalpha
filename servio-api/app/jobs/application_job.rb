class ApplicationJob < ActiveJob::Base
  retry_on ActiveRecord::Deadlocked
  discard_on ActiveJob::DeserializationError

  # Jobs run for one business at a time, inside the same tenancy context as a request.
  def within_business(business_id)
    business = Business.find(business_id)
    Tenancy::Context.with(business) { yield business }
  end
end

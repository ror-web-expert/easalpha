# Daily at 9 am: a one-use birthday coupon by WhatsApp for every opted-in customer whose birthday is today.
class BirthdayOffersJob < ApplicationJob
  queue_as :messages

  def perform(business_id = nil)
    if business_id
      within_business(business_id) { Loyalty.birthday_offers! if Loyalty.enabled? }
    else
      Tenancy::Context.unscoped { Business.where(status: %w[trial active]).pluck(:id) }.each { |id| BirthdayOffersJob.perform_later(id) }
    end
  end
end

class CampaignSendJob < ApplicationJob
  queue_as :messages

  def perform(campaign_id)
    c = Tenancy::Context.unscoped { Campaign.find_by(id: campaign_id) } or return
    within_business(c.business_id) { Campaigns::Sender.send!(Campaign.find(campaign_id)) }
  end
end

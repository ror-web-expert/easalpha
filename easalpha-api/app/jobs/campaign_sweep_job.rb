# Every 5 minutes: start scheduled campaigns whose time has come.
class CampaignSweepJob < ApplicationJob
  queue_as :messages

  def perform
    Tenancy::Context.unscoped { Campaign.where(status: "scheduled").where("scheduled_at <= ?", Time.current).pluck(:id) }.each { |id| CampaignSendJob.perform_later(id) }
  end
end

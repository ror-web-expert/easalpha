# SPEC: a scheduled job that builds the AI Pricing Analysis and AI Stock Forecast aggregates and stores the suggestions.
class AiInsightsJob < ApplicationJob
  queue_as :default

  def perform
    Tenancy::Context.unscoped do
      Business.find_each do |biz|
        Tenancy::Context.with(biz) do
          Branch.active.find_each do |branch|
            Ai::Insights.pricing!(branch: branch)
            Ai::Insights.stock_forecast!(branch: branch)
          rescue StandardError => e
            Rails.logger.error("[ai] insights failed for #{branch.id}: #{e.message}")
          end
        end
      end
    end
  end
end

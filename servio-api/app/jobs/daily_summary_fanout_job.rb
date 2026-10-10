class DailySummaryFanoutJob < ApplicationJob
  queue_as :messages

  def perform
    Business.where(status: %w[trial active grace]).find_each { |b| DailySummaryJob.perform_later(b.id) }
  end
end

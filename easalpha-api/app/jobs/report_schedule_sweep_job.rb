# Every 15 minutes: enqueue every schedule whose next run time has passed.
class ReportScheduleSweepJob < ApplicationJob
  queue_as :messages

  def perform
    Tenancy::Context.unscoped do
      ReportSchedule.due.pluck(:id).each { |id| ReportScheduleJob.perform_later(id) }
    end
  end
end

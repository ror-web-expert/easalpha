# Sends one scheduled report. Runs inside the schedule's business.
class ReportScheduleJob < ApplicationJob
  queue_as :messages

  def perform(schedule_id)
    schedule = ReportSchedule.unscoped.find_by(id: schedule_id) or return
    within_business(schedule.business_id) do
      s = ReportSchedule.find(schedule_id)
      begin
        Reports::Scheduled.deliver!(s)
        s.mark_run!
      rescue StandardError => e
        s.mark_run!(error: "#{e.class}: #{e.message}")
        raise
      end
    end
  end
end

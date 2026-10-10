# SPEC: anyone who never checks out is auto-closed at the end of the business day. Runs every 30 minutes and closes
# the days that have ended.
class AttendanceAutoCloseJob < ApplicationJob
  queue_as :default

  def perform
    Tenancy.unscoped do
      Business.find_each do |biz|
        Tenancy::Context.with(biz) do
          Branch.active.find_each do |branch|
            today = branch.business_day_for(Time.current)
            Payroll::Attendance.auto_close!(branch: branch, day: today - 1)
          end
        end
      end
    end
  end
end

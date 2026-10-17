# The trial is 40 days now, so its reminders go out 7, 3 and 1 day before the end instead of on day 60, 80 and 88 of a
# 90-day trial. The old columns stay (they record what earlier trials were sent) and are no longer written.
class TrialRemindersByDaysLeft < ActiveRecord::Migration[8.1]
  def change
    add_column :businesses, :trial_reminder_7_at, :datetime
    add_column :businesses, :trial_reminder_3_at, :datetime
    add_column :businesses, :trial_reminder_1_at, :datetime
  end
end

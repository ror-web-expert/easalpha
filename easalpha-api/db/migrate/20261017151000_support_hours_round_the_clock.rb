# 17 Oct 2026: support answers 24/7. A stored support_hours that still holds the old default is cleared, so the new
# default ("24/7, every day of the year") shows; a value someone typed on the platform console is left alone.
class SupportHoursRoundTheClock < ActiveRecord::Migration[8.1]
  OLD = "10 am to 11 pm Pakistan time, every day".freeze

  def up
    execute("DELETE FROM platform_settings WHERE key = 'support_hours' AND value = #{quote(OLD.to_json)}::jsonb")
  end

  def down; end
end

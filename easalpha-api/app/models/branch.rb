class Branch < ApplicationRecord
  include Tenanted

  has_many :devices, dependent: :destroy
  validates :name, :code, :time_zone, :day_end_time, :business_day_start, presence: true
  validates :code, uniqueness: { scope: :business_id }
  scope :active, -> { where(archived_at: nil) }

  before_validation { self.code ||= "B#{Branch.unscoped.where(business_id: business_id).count + 1}" }

  # The business day an instant belongs to. SPEC: the day is a window (default 06:01 to 02:01); anything before the end
  # time belongs to the previous date, so 1:00 am is still yesterday's trade. The start time is informational (top bar,
  # attendance fallback) and never splits a day.
  def business_day_for(time)
    local = time.in_time_zone(time_zone)
    cutoff = local.change(hour: day_end_time.hour, min: day_end_time.min)
    date = local.to_date
    local < cutoff ? date - 1 : date
  end

  def business_day_window = "#{business_day_start.strftime('%H:%M')} to #{day_end_time.strftime('%H:%M')}"

  # The instant a business day ends: its end time on the following calendar date (02:01 the next morning by default).
  def business_day_end_at(day)
    Time.use_zone(time_zone) { Time.zone.parse("#{day + 1} #{day_end_time.strftime('%H:%M')}") }
  end

  QR_DEFAULTS = { "enabled" => false, "cashier_accept" => true, "call_waiter" => true, "ask_bill" => true, "running_bill" => true, "guest_name" => true, "welcome" => nil }.freeze

  def qr_setting(key) = (qr_settings || {}).fetch(key.to_s, QR_DEFAULTS[key.to_s])
  def qr_config = QR_DEFAULTS.merge(qr_settings || {})
end

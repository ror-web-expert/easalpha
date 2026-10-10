# A report sent on a schedule by WhatsApp or email: daily summary, sales, items, cashiers, grand, stock sheet, expenses, payables, khata.
class ReportSchedule < ApplicationRecord
  include Tenanted
  KINDS = %w[daily_summary sales items cashiers grand stock_sheet expenses payables khata].freeze
  CADENCES = %w[daily weekly monthly].freeze
  CHANNELS = %w[whatsapp email both].freeze
  belongs_to :branch, optional: true
  validates :name, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :cadence, inclusion: { in: CADENCES }
  validates :channel, inclusion: { in: CHANNELS }
  validates :hour, inclusion: { in: 0..23 }
  validates :weekday, inclusion: { in: 0..6 }
  validates :day_of_month, inclusion: { in: 1..28 }
  validate { errors.add(:recipients, "add at least one phone or email") if recipients.blank? }
  before_save { self.next_run_at ||= compute_next_run(Time.current) }
  scope :due, -> { where(active: true).where("next_run_at <= ?", Time.current) }

  def compute_next_run(from)
    zone = business&.time_zone.presence || "Asia/Karachi"
    now = from.in_time_zone(zone)
    candidate = now.change(hour: hour, min: 0, sec: 0)
    case cadence
    when "daily"
      candidate += 1.day if candidate <= now
    when "weekly"
      candidate += 1.day until candidate.wday == weekday && candidate > now
    when "monthly"
      candidate = candidate.change(day: day_of_month)
      candidate = (candidate + 1.month).change(day: day_of_month) if candidate <= now
    end
    candidate.utc
  end

  def mark_run!(error: nil)
    update_columns(last_run_at: Time.current, last_error: error, next_run_at: compute_next_run(Time.current))
  end

  # The period the report covers at run time: yesterday, last 7 days, or last month.
  def period(as_of = Date.current)
    case cadence
    when "weekly" then [ as_of - 7, as_of - 1 ]
    when "monthly" then [ (as_of - 1).beginning_of_month, as_of - 1 ]
    else [ as_of - 1, as_of - 1 ]
    end
  end
end

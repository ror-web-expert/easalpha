# A meal window at a canteen branch: Breakfast 07:00 to 10:00, Lunch 12:00 to 15:00. A worker takes one meal per session.
class MealSession < ApplicationRecord
  include Tenanted
  belongs_to :branch
  has_many :meal_plans, dependent: :restrict_with_error
  validates :name, presence: true
  # docs/09-canteen.md: one meal per worker per session, held by the unique index on (worker, day, session) so two
  # kiosks serving the same finger at the same second still give one meal. A second meal in a shift is a second session.
  validates :max_claims, inclusion: { in: [ 1 ], message: "must be 1: a worker takes one meal per session; add another session for a second meal in the same shift" }
  scope :active, -> { where(active: true) }

  # Does the window hold this moment in the branch's clock? A window past midnight (22:00 to 02:00) wraps; `grace`
  # widens it at both ends, for a claim that reaches the server just after the window closed.
  def covers?(at, time_zone, grace: 0) = !occurrence_start(at, time_zone, grace: grace).nil?

  # When the window holding `at` opened, or nil: today's start, or yesterday's for a window past midnight (23:00 to
  # 06:00 at 03:00), so a night shift is one meal whatever the clock says after midnight. Inside the window wins, then
  # just closed (within the grace), then about to open: an all-day window at 23:59 is today's, not tomorrow's.
  def occurrence_start(at, time_zone, grace: 0)
    local = at.in_time_zone(time_zone)
    g = grace.to_i / 60
    start = starts_at.hour * 60 + starts_at.min
    length = (ends_at.hour * 60 + ends_at.min - start) % 1440
    since = (local.hour * 60 + local.min - start) % 1440 # minutes since the latest start at or before `at`
    since -= 1440 if since >= length + g && since >= 1440 - g # early for the next start
    return nil unless since < length + g
    local.change(sec: 0) - since.minutes
  end
end

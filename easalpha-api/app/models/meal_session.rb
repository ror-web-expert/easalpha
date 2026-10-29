# A meal window at a canteen branch: Breakfast 07:00 to 10:00, Lunch 12:00 to 15:00. A worker takes one meal per session.
class MealSession < ApplicationRecord
  include Tenanted
  belongs_to :branch
  has_many :meal_plans, dependent: :restrict_with_error
  validates :name, presence: true
  validates :max_claims, numericality: { greater_than: 0 }
  scope :active, -> { where(active: true) }

  # Does the window hold this moment in the branch's clock? A window past midnight (22:00 to 02:00) wraps.
  def covers?(at, time_zone)
    local = at.in_time_zone(time_zone)
    minutes = local.hour * 60 + local.min
    s = starts_at.hour * 60 + starts_at.min
    e = ends_at.hour * 60 + ends_at.min
    s <= e ? (minutes >= s && minutes < e) : (minutes >= s || minutes < e)
  end
end

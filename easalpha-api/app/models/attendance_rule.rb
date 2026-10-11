# SPEC attendance rules: the business Defaults row (employee_id nil) and per-employee overrides. Changing a rule never
# rewrites saved days; rows keep their stored status until scanned or edited again.
class AttendanceRule < ApplicationRecord
  include Tenanted
  PENALTIES = %w[fine_only lose_day both none].freeze
  belongs_to :employee, optional: true
  validates :absent_rule, inclusion: { in: %w[calendar_days fixed_26] }
  validates :late_penalty, :half_day_penalty, :absent_penalty, inclusion: { in: PENALTIES }
  validates :checkout_gap_minutes, :free_lates, :free_half_days, :free_absents, numericality: { greater_than_or_equal_to: 0 }
  validates :fixed_divisor, numericality: { greater_than: 0 }
  def working_day?(date) = working_days.include?(date.wday)
  def weekly_off?(date) = !working_day?(date)
  def defaults? = employee_id.nil?
  def divisor(days_in_month) = absent_rule == "fixed_26" ? fixed_divisor : days_in_month
  def penalty_for(status) = { "late" => late_penalty, "half_day" => half_day_penalty, "absent" => absent_penalty }[status] || "none"
  def fine_for(status) = { "late" => late_fine_minor, "half_day" => half_day_fine_minor, "absent" => absent_fine_minor }[status] || 0
  def free_for(status) = { "late" => free_lates, "half_day" => free_half_days, "absent" => free_absents }[status] || 0
end

class AttendanceRule < ApplicationRecord
  include Tenanted
  belongs_to :employee, optional: true
  validates :absent_rule, inclusion: { in: %w[calendar_days fixed_26] }

  def working_day?(date) = working_days.include?(date.wday)
end

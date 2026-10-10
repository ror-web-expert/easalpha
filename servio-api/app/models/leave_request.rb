class LeaveRequest < ApplicationRecord
  include Tenanted
  belongs_to :employee
  validates :kind, inclusion: { in: %w[paid unpaid sick] }
  validates :status, inclusion: { in: %w[pending approved rejected] }
  validate { errors.add(:to_date, "must not be before the start") if from_date && to_date && to_date < from_date }

  def covers?(date) = status == "approved" && date.between?(from_date, to_date)
end

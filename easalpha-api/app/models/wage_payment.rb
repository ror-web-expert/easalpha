# A daily or weekly wage paid to an employee whose pay frequency is daily or weekly: days worked times the rate, plus a
# bonus, minus deductions and any advance recovered. Paid as a Wages expense. Voiding reverses the expense.
class WagePayment < ApplicationRecord
  include Tenanted
  belongs_to :employee
  validates :status, inclusion: { in: %w[paid voided] }
  validates :period_from, :period_to, presence: true
  validates :net_minor, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  def label = "WG-#{number.to_s.rjust(6, '0')}"
  def paid? = status == "paid"
end

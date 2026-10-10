class Payslip < ApplicationRecord
  include Tenanted
  belongs_to :payroll_run
  belongs_to :employee
end

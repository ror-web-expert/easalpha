# SPEC Scan Log: every tap on the attendance reader, whether it checked someone in, out, was inside the checkout gap
# ("Already Marked") or matched nobody.
class AttendanceScan < ApplicationRecord
  include Tenanted
  RESULTS = %w[check_in check_out already_marked rejected unknown manual_out auto_close].freeze
  belongs_to :employee, optional: true
  belongs_to :attendance, optional: true
  validates :result, inclusion: { in: RESULTS }
end

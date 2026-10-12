# One send of customer bills for a period: the month-end job (trigger auto, once per period) or an owner pressing
# Send bills. results holds one row per customer: sent, failed (with the reason) or skipped.
class BillRun < ApplicationRecord
  include Tenanted
  validates :trigger, inclusion: { in: %w[auto manual] }
  validates :status, inclusion: { in: %w[running done] }
  validates :period_from, :period_to, presence: true
end

# One row per safety-net sweep (SPEC Deduction Health: "whether the safety net is running").
class SafetyNetRun < ApplicationRecord
  include Tenanted
  TRIGGERS = %w[job manual].freeze
  validates :trigger, inclusion: { in: TRIGGERS }
end

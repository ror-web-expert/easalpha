class Attendance < ApplicationRecord
  include Tenanted
  belongs_to :employee
  belongs_to :branch, optional: true
  validates :source, inclusion: { in: %w[fingerprint selfie manual pin] }
  validates :status, inclusion: { in: %w[present absent leave holiday half_day] }
end

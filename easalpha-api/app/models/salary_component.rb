class SalaryComponent < ApplicationRecord
  include Tenanted
  validates :name, presence: true
  validates :kind, inclusion: { in: %w[earning deduction] }
  scope :active, -> { where(archived_at: nil) }
end

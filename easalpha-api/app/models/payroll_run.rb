class PayrollRun < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  has_many :payslips, dependent: :destroy
  validates :status, inclusion: { in: %w[generated approved paid cancelled] }

  def label = "PAY-#{month.strftime('%Y-%m')}"
end

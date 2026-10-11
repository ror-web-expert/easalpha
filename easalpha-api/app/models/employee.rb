class Employee < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  belongs_to :membership, optional: true
  belongs_to :department, optional: true
  has_many :employee_salary_components, dependent: :destroy
  has_many :attendances, dependent: :destroy
  has_many :leave_requests, dependent: :destroy
  has_many :advances, dependent: :restrict_with_error
  has_many :payslips, dependent: :restrict_with_error
  validates :name, presence: true
  validates :pay_frequency, inclusion: { in: %w[monthly] }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :active, -> { where(archived_at: nil) }

  def active_on?(day) = (joined_on.nil? || joined_on <= day) && (left_on.nil? || left_on >= day)
  def rule = AttendanceRule.find_by(employee_id: id) || AttendanceRule.find_by(employee_id: nil) || AttendanceRule.new
end

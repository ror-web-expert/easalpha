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
  has_many :wage_payments, dependent: :restrict_with_error
  FREQUENCIES = %w[monthly weekly daily].freeze
  validates :name, presence: true
  validates :pay_frequency, inclusion: { in: FREQUENCIES }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :active, -> { where(archived_at: nil) }

  # base_salary_minor is the pay for one period of pay_frequency: a month's salary, a week's wage or a day's wage.
  def monthly? = pay_frequency == "monthly"
  def wage_earner? = !monthly?

  def active_on?(day) = (joined_on.nil? || joined_on <= day) && (left_on.nil? || left_on >= day)
  def rule = AttendanceRule.find_by(employee_id: id) || AttendanceRule.find_by(employee_id: nil) || AttendanceRule.new
end

class Attendance < ApplicationRecord
  include Tenanted
  STATUSES = %w[present late half_day absent leave holiday weekly_off].freeze
  CHARGEABLE = %w[late half_day absent].freeze
  belongs_to :employee
  belongs_to :branch, optional: true
  has_many :scans, class_name: "AttendanceScan", dependent: :nullify
  validates :source, inclusion: { in: %w[fingerprint selfie manual pin] }
  validates :status, inclusion: { in: STATUSES }
  def checked_in? = checked_in_at.present?
  def open? = checked_in_at.present? && checked_out_at.nil?
end

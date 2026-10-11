class Expense < ApplicationRecord
  include Tenanted
  SOURCES = %w[admin till payroll_sync rider_float].freeze
  belongs_to :branch
  belongs_to :category, class_name: "ExpenseCategory"
  belongs_to :payment_method, optional: true
  belongs_to :payment_account, optional: true
  belongs_to :shift, optional: true
  before_create { self.id ||= SecureRandom.uuid }
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  validates :source, inclusion: { in: SOURCES }
  scope :live, -> { where(voided_at: nil) }

  def label = "EXP-#{number}"
  def voided? = voided_at.present?
end

# SPEC Fixed Assets: an asset on the chart with straight-line depreciation posted as journal entries.
class FixedAsset < ApplicationRecord
  include Tenanted
  STATUSES = %w[active disposed].freeze
  belongs_to :gl_account, class_name: "GlAccount"
  belongs_to :accumulated_account, class_name: "GlAccount"
  belongs_to :expense_account, class_name: "GlAccount"
  validates :name, presence: true
  validates :cost_minor, numericality: { greater_than: 0, only_integer: true }
  validates :useful_life_months, numericality: { greater_than: 0, only_integer: true }
  validates :method, inclusion: { in: %w[straight_line] }
  validates :status, inclusion: { in: STATUSES }
  scope :active, -> { where(status: "active") }
  def depreciable_minor = cost_minor - salvage_minor
  def monthly_minor = (depreciable_minor.to_d / useful_life_months).round
  def book_value_minor = cost_minor - accumulated_minor
end

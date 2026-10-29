# One worker's meal at one session: the fingerprint scan, the dish, the token, and the order that carries the money.
# The partial unique index (employee, day, session, not cancelled) is the "already taken" rule, enforced even when two
# kiosks serve the same worker at the same moment.
class MealClaim < ApplicationRecord
  include Tenanted
  STATUSES = %w[claimed served cancelled].freeze
  SOURCES = %w[fingerprint card manual code].freeze
  belongs_to :branch
  belongs_to :meal_session
  belongs_to :meal_plan
  belongs_to :meal_plan_item
  belongs_to :employee
  belongs_to :customer, optional: true
  belongs_to :order, optional: true
  belongs_to :device, optional: true
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }
  scope :live, -> { where.not(status: "cancelled") }

  def product = meal_plan_item.product
  def served? = status == "served"
  def cancelled? = status == "cancelled"
end

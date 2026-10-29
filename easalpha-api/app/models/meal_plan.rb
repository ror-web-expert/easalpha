# The dishes offered at one session on one day. Draft until published; the kiosk only serves a published plan.
class MealPlan < ApplicationRecord
  include Tenanted
  STATUSES = %w[draft published closed].freeze
  belongs_to :branch
  belongs_to :meal_session
  has_many :items, -> { order(:sort_order) }, class_name: "MealPlanItem", dependent: :destroy
  has_many :claims, class_name: "MealClaim", dependent: :restrict_with_error
  validates :status, inclusion: { in: STATUSES }
  validates :plan_date, presence: true

  def published? = status == "published"
end

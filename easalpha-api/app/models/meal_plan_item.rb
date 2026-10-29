# One dish on a day's plan: how many were cooked and what the worker pays (blank = the product's price; less = subsidy).
class MealPlanItem < ApplicationRecord
  include Tenanted
  belongs_to :meal_plan
  belongs_to :product
  validates :planned_qty, numericality: { greater_than: 0, only_integer: true }, allow_nil: true
  validates :worker_price_minor, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true

  def sold_out? = planned_qty.present? && claims_count >= planned_qty
end

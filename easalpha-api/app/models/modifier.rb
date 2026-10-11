class Modifier < ApplicationRecord
  include Tenanted
  belongs_to :stock_item, optional: true
  belongs_to :stock_unit, class_name: "Unit", optional: true
  belongs_to :modifier_group
  validates :name, presence: true
  validates :price_minor, numericality: { only_integer: true }
end

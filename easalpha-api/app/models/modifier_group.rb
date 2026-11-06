class ModifierGroup < ApplicationRecord
  include Tenanted
  has_many :modifiers, -> { where(active: true).order(:sort_order) }, dependent: :destroy
  has_many :product_modifier_groups, dependent: :destroy
  validates :name, presence: true
  validates :min_select, :max_select, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  validate { errors.add(:max_select, "cannot be less than Min select") if max_select && min_select && max_select < min_select } # as the form names them (S13)
  scope :active, -> { where(archived_at: nil) }
end

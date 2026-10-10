# One line of an order's story (SPEC): punched, reopened, edited, completed, cancelled or payment, with the person, role,
# time and the item and money diff of an edit. Rows are never updated.
class OrderEvent < ApplicationRecord
  include Tenanted
  TYPES = %w[punched reopened edited completed cancelled payment].freeze
  belongs_to :order
  validates :event_type, inclusion: { in: TYPES }
  def readonly? = persisted?
end

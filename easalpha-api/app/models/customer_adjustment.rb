# A line on a customer account that is not a sale or a payment: the opening balance carried over from a paper register,
# a correction, or the reversal of either. Positive means the customer owes more, negative means they owe less.
# Insert-only (database trigger): a mistake is fixed with a reversal row, never by editing.
class CustomerAdjustment < ApplicationRecord
  include Tenanted
  KINDS = %w[opening adjustment reversal].freeze
  belongs_to :customer
  belongs_to :reverses, class_name: "CustomerAdjustment", optional: true
  has_one :reversal, class_name: "CustomerAdjustment", foreign_key: :reverses_id
  validates :kind, inclusion: { in: KINDS }
  validates :amount_minor, numericality: { only_integer: true, other_than: 0 }
  validates :reason, presence: true
  validates :effective_on, :business_day, presence: true

  def label = "ADJ-#{number.to_s.rjust(6, '0')}"
  def reversed? = reversal.present?
end

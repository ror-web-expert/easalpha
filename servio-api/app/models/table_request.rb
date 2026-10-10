# A guest at a QR table asking for a waiter or the bill.
class TableRequest < ApplicationRecord
  include Tenanted
  KINDS = %w[call_waiter ask_bill].freeze
  belongs_to :branch
  belongs_to :table, class_name: "DiningTable"
  validates :kind, inclusion: { in: KINDS }
  scope :open, -> { where(handled_at: nil) }
end

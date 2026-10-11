class KitchenTicket < ApplicationRecord
  include Tenanted
  belongs_to :order
  belongs_to :branch
  KINDS = %w[new changed cancelled reprint].freeze
  validates :kind, inclusion: { in: KINDS }
  scope :unprinted, -> { where(printed_at: nil) }
end

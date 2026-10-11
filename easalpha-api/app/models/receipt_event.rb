class ReceiptEvent < ApplicationRecord
  include Tenanted
  belongs_to :order
  KINDS = %w[print reprint whatsapp email].freeze
  validates :kind, inclusion: { in: KINDS }
end

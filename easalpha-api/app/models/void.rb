class Void < ApplicationRecord
  include Tenanted
  belongs_to :order
  STOCK_ACTIONS = %w[none returned waste].freeze
  validates :reason, presence: true
  validates :stock_action, inclusion: { in: STOCK_ACTIONS }
end

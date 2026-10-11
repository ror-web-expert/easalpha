class RiderSettlement < ApplicationRecord
  include Tenanted
  belongs_to :rider
  has_many :deliveries, foreign_key: :settlement_id

  def label = "RS-#{number}"
end

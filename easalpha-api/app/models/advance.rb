class Advance < ApplicationRecord
  include Tenanted
  belongs_to :employee
  validates :amount_minor, numericality: { greater_than: 0, only_integer: true }
  validates :status, inclusion: { in: %w[pending approved rejected paid repaid] }

  def label = "ADV-#{number}"
end

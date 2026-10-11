class Voucher < ApplicationRecord
  include Tenanted
  belongs_to :voucher_batch
  belongs_to :customer, optional: true
  validates :code, presence: true, uniqueness: { scope: :business_id }
  validates :status, inclusion: { in: %w[issued redeemed void] }
  before_validation { self.code = code.to_s.strip.upcase }
  def self.generate_code(prefix = "V") = "#{prefix}-#{SecureRandom.alphanumeric(6).upcase}"
end

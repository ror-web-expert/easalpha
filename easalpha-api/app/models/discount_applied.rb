class DiscountApplied < ApplicationRecord
  include Tenanted
  self.table_name = "discounts_applied"
  KINDS = %w[percent fixed promotion loyalty voucher regular].freeze # SPEC: vouchers and regular (recency) discounts
  belongs_to :order
  validates :kind, inclusion: { in: KINDS }
  validates :value, numericality: { greater_than: 0 }
end

# SPEC Vouchers: a batch fixes value, minimum spend and expiry. Personal batches generate one code per customer;
# a public batch is a single code usable on any order until it expires or hits its usage limit.
class VoucherBatch < ApplicationRecord
  include Tenanted
  has_many :vouchers, dependent: :destroy
  validates :name, presence: true
  validates :kind, inclusion: { in: %w[personal public] }
  validates :value_kind, inclusion: { in: %w[fixed percent] }
  validates :value, numericality: { greater_than: 0 }
  validates :public_code, presence: true, if: -> { kind == "public" }
  before_validation { self.public_code = public_code.to_s.strip.upcase.presence }
  scope :active, -> { where(active: true, archived_at: nil) }
  def expired? = expires_on.present? && expires_on < Date.current
  def exhausted? = kind == "public" && usage_limit.present? && redeemed_count >= usage_limit
  def discount_for(amount_minor)
    return 0 if amount_minor < min_spend_minor
    value_kind == "percent" ? (amount_minor * value / 100).round : [ amount_minor, (value * 100).to_i ].min
  end
end

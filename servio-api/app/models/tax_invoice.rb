class TaxInvoice < ApplicationRecord
  include Tenanted
  STATUSES = %w[queued sent accepted failed skipped].freeze
  belongs_to :order
  belongs_to :branch
  validates :status, inclusion: { in: STATUSES }
  scope :pending, -> { where(status: %w[queued failed]).where("next_attempt_at is null or next_attempt_at <= ?", Time.current) }

  def accepted? = status == "accepted"
end

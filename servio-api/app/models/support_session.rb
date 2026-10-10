class SupportSession < ApplicationRecord
  include Tenanted
  STATUSES = %w[requested approved denied ended expired].freeze
  validates :reason, presence: true
  validates :status, inclusion: { in: STATUSES }
  def active? = status == "approved" && expires_at && expires_at > Time.current && ended_at.nil?
end

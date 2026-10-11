# A WhatsApp marketing campaign to a customer segment. Only opted-in customers receive it; STOP opts them out.
class Campaign < ApplicationRecord
  include Tenanted
  STATUSES = %w[draft scheduled sending sent cancelled].freeze
  SEGMENTS = %w[all group inactive birthday_month top_spenders khata_due].freeze
  belongs_to :promotion, optional: true
  validates :name, :body, presence: true
  validates :status, inclusion: { in: STATUSES }
  validate { errors.add(:segment, "kind must be one of #{SEGMENTS.join(', ')}") unless SEGMENTS.include?(segment["kind"].to_s) }

  def editable? = status.in?(%w[draft scheduled])
end

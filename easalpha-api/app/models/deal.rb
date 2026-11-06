class Deal < ApplicationRecord
  include Tenanted
  belongs_to :tax_rate, optional: true
  has_many :deal_items, dependent: :destroy
  validates :name, presence: true
  validates :price_minor, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  scope :active, -> { where(archived_at: nil, active: true) }

  # Valid from and Valid to are days the owner picks on a calendar. They are kept as that date at midnight UTC and
  # compared with the business's own date, so a deal valid from today to today holds all of today. Compared as
  # instants, "to 6 Nov" ended at 05:00 in Lahore and the deal was refused that evening (S9, 6 Nov 2026).
  before_validation :dates_as_days
  validate { errors.add(:valid_to, "must be on or after Valid from") if valid_from && valid_to && valid_to < valid_from }

  def available_at?(time)
    day = time.in_time_zone(zone).to_date
    (valid_from.nil? || day >= valid_from_day) && (valid_to.nil? || day <= valid_to_day)
  end

  def valid_from_day = valid_from&.utc&.to_date
  def valid_to_day = valid_to&.utc&.to_date

  private

  def zone = business&.time_zone.presence || "Asia/Karachi"

  # "2026-11-06" is that day; a full time (an older form sent the ISO value back) is the business's date at that time.
  def dates_as_days
    %i[valid_from valid_to].each do |attr|
      value = self[attr]
      next if value.nil? || !will_save_change_to_attribute?(attr)
      raw = read_attribute_before_type_cast(attr)
      day = raw.is_a?(String) && raw.match?(/\A\d{4}-\d{2}-\d{2}\z/) ? Date.iso8601(raw) : value.in_time_zone(zone).to_date
      self[attr] = Time.utc(day.year, day.month, day.day)
    end
  end
end

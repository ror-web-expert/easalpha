class Reservation < ApplicationRecord
  include Tenanted
  STATUSES = %w[booked confirmed seated completed no_show cancelled].freeze
  belongs_to :branch
  belongs_to :table, class_name: "DiningTable", optional: true
  belongs_to :customer, optional: true
  validates :guest_name, presence: true
  validates :party_size, numericality: { greater_than: 0, only_integer: true }
  validates :status, inclusion: { in: STATUSES }
  validate { errors.add(:ends_at, "must be after the start") if starts_at && ends_at && ends_at <= starts_at }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :live, -> { where(status: %w[booked confirmed seated]) }

  def overlaps?(other_scope)
    other_scope.where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
  end
end

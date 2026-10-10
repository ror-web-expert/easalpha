class Rider < ApplicationRecord
  include Tenanted
  STATUSES = %w[available busy offline].freeze
  belongs_to :branch, optional: true
  belongs_to :membership, optional: true
  has_many :deliveries, dependent: :restrict_with_error
  has_many :cash_movements, class_name: "RiderCashMovement", dependent: :restrict_with_error
  has_many :settlements, class_name: "RiderSettlement", dependent: :restrict_with_error
  validates :name, presence: true
  validates :status, inclusion: { in: STATUSES }
  before_validation { self.phone = User.normalize_phone(phone) if phone.present? }
  scope :active, -> { where(active: true, archived_at: nil) }

  def move_float!(delta)
    Rider.where(id: id).update_all(["float_minor = float_minor + ?", delta])
    reload
  end

  def unsettled_deliveries = deliveries.where(status: "delivered", settled_at: nil)
end

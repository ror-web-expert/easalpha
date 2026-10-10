class DiningTable < ApplicationRecord
  include Tenanted
  STATUSES = %w[available occupied reserved bill_requested maintenance].freeze
  belongs_to :branch
  belongs_to :floor, optional: true
  validates :code, presence: true, uniqueness: { scope: :branch_id, conditions: -> { where(archived_at: nil) } }
  validates :status, inclusion: { in: STATUSES }
  validates :seats, numericality: { greater_than: 0, only_integer: true }
  scope :active, -> { where(archived_at: nil) }
  before_validation { self.qr_token ||= SecureRandom.urlsafe_base64(12) }

  def occupy!(order) = update!(status: "occupied", current_order_id: order.id)
  def release! = update!(status: "available", current_order_id: nil)
end

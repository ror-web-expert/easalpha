# A message from a business to EasAlpha support (the Help box in the admin panel). Super admins answer from the
# super panel; the answer comes back as a notification and in the same box.
class SupportRequest < ApplicationRecord
  include Tenanted
  STATUSES = %w[open answered closed].freeze
  CATEGORIES = %w[question problem billing feature other].freeze

  belongs_to :membership, optional: true
  belongs_to :replied_by, class_name: "SuperAdmin", foreign_key: :replied_by_super_admin_id, optional: true

  validates :subject, presence: true, length: { maximum: 200 }
  validates :message, presence: true, length: { maximum: 5000 }
  validates :status, inclusion: { in: STATUSES }
  validates :category, inclusion: { in: CATEGORIES }

  scope :open_first, -> { order(Arel.sql("CASE status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END"), created_at: :desc) }

  def open? = status == "open"
end

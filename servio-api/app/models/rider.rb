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

  # SPEC temporary riders: throwaway records with a lifetime of one order, N orders, the rest of today or N hours.
  LIFETIMES = %w[one_order n_orders rest_of_today n_hours].freeze
  validates :lifetime_kind, inclusion: { in: LIFETIMES }, if: :temporary
  scope :permanent, -> { where(temporary: false) }
  scope :temporary, -> { where(temporary: true) }

  def self.lifetime_for(kind, value, branch:)
    case kind
    when "one_order" then { orders_allowed: 1, expires_at: nil }
    when "n_orders" then { orders_allowed: [value.to_i, 1].max, expires_at: nil }
    when "rest_of_today" then { orders_allowed: nil, expires_at: branch.business_day_end_at(branch.business_day_for(Time.current)) }
    when "n_hours" then { orders_allowed: nil, expires_at: Time.current + [value.to_i, 1].max.hours }
    end
  end

  def expired? = temporary && ((expires_at && expires_at <= Time.current) || (orders_allowed && orders_used >= orders_allowed))
  def lifetime_label
    return nil unless temporary
    case lifetime_kind
    when "one_order" then "One order"
    when "n_orders" then "#{orders_allowed} orders"
    when "rest_of_today" then "Rest of today"
    when "n_hours" then "#{lifetime_value} hours"
    end
  end
  def assigned_count = deliveries.where.not(status: "unassigned").count
  def completed_count = deliveries.where(status: "delivered").count
end

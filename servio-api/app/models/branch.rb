class Branch < ApplicationRecord
  include Tenanted

  has_many :devices, dependent: :destroy
  validates :name, :code, :time_zone, :day_end_time, presence: true
  validates :code, uniqueness: { scope: :business_id }
  scope :active, -> { where(archived_at: nil) }

  before_validation { self.code ||= "B#{Branch.unscoped.where(business_id: business_id).count + 1}" }

  # The business day an instant belongs to, given this branch's day-end time.
  def business_day_for(time)
    local = time.in_time_zone(time_zone)
    cutoff = local.change(hour: day_end_time.hour, min: day_end_time.min)
    date = local.to_date
    local < cutoff ? date - 1 : date
  end

  QR_DEFAULTS = { "enabled" => false, "cashier_accept" => true, "call_waiter" => true, "ask_bill" => true, "running_bill" => true, "guest_name" => true, "welcome" => nil }.freeze

  def qr_setting(key) = (qr_settings || {}).fetch(key.to_s, QR_DEFAULTS[key.to_s])
  def qr_config = QR_DEFAULTS.merge(qr_settings || {})
end

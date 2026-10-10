class Menu < ApplicationRecord
  include Tenanted
  has_many :categories, -> { where(archived_at: nil).order(:sort_order) }, dependent: :destroy
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }
  after_save { Menu.where.not(id: id).update_all(is_default: false) if is_default }

  # time_rules: { "days" => [1..7], "start" => "06:00", "end" => "11:00" }; empty means always available.
  def available_at?(time, zone: "Asia/Karachi")
    return true if time_rules.blank?
    local = time.in_time_zone(zone)
    days = Array(time_rules["days"]).map(&:to_i)
    return false if days.any? && !days.include?(local.wday.zero? ? 7 : local.wday)
    s, e = time_rules["start"], time_rules["end"]
    return true if s.blank? || e.blank?
    hm = local.strftime("%H:%M")
    s <= e ? (hm >= s && hm < e) : (hm >= s || hm < e)
  end
end

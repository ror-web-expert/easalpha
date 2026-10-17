# EasAlpha-wide settings owned by the product owner (super admin): how to reach support, hours, the powered-by line
# and an announcement every admin panel shows. Not tenant data; readable without a login.
class PlatformSetting < ApplicationRecord
  validates :key, presence: true, uniqueness: true

  DEFAULTS = {
    "product_name" => "EasAlpha",
    "support_email" => "hello@easalpha.com",
    "support_whatsapp" => "+923437172731",
    "support_phone" => "+923437172731",
    "support_hours" => "24/7, every day of the year",
    "support_url" => nil,
    "docs_url" => nil,
    "powered_by" => "Powered by EasAlpha",
    "announcement" => nil,
    "announcement_level" => "info", # info | warning
    "downloads_url" => nil, # blank: the website serves its own /downloads folder, so localhost links on localhost and domain links once live
    "desktop_version" => "0.2.0" # the version the Download page links to; bump on every desktop release
  }.freeze

  def self.all_values
    stored = where(key: DEFAULTS.keys).pluck(:key, :value).to_h
    DEFAULTS.merge(stored) { |_k, default, stored_value| stored_value.nil? ? default : stored_value }
  end

  def self.get(key) = all_values.fetch(key.to_s)

  # Writes only known keys; nil restores the default.
  def self.update_values!(values)
    values.each do |k, v|
      next unless DEFAULTS.key?(k.to_s)
      row = find_or_initialize_by(key: k.to_s)
      row.value = v.presence
      row.save!
    end
    all_values
  end
end

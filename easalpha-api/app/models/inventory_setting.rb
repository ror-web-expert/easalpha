class InventorySetting < ApplicationRecord
  include Tenanted
  validates :weight_display, inclusion: { in: %w[auto g kg] }
  validates :volume_display, inclusion: { in: %w[auto ml l] }

  def self.current = find_or_create_by!(business_id: Current.business_id)

  def locked?(day) = day_lock_date && day && day <= day_lock_date
end

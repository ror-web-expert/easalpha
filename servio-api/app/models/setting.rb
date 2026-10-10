# One row per setting key per business (branch_id nil) or per branch override. Values are jsonb; the registry gives the type.
class Setting < ApplicationRecord
  include Tenanted
  belongs_to :branch, optional: true
  validates :key, presence: true, inclusion: { in: ->(_) { Settings::Registry.keys } }, uniqueness: { scope: [:business_id, :branch_id] }

  # Effective values for a business: stored rows over registry defaults, with the legacy jsonb as a fallback in between.
  def self.effective(business, branch: nil)
    stored = where(branch_id: nil).pluck(:key, :value).to_h
    stored.merge!(where(branch_id: branch.id).pluck(:key, :value).to_h) if branch
    Settings::Registry::KEYS.transform_values do |k|
      stored.key?(k.key) ? stored[k.key] : business.settings.fetch(k.key) { k.default }
    end
  end

  # Writes keys, bumps the business version once, mirrors legacy names. Returns the new version.
  def self.write!(business, values, branch: nil, user: nil)
    Setting.transaction do
      values.each do |key, raw|
        value = Settings::Registry.cast(key, raw)
        row = find_or_initialize_by(business_id: business.id, branch_id: branch&.id, key: key.to_s)
        row.update!(value: value, updated_by_user_id: user&.id)
        mirror = Settings::Registry::MIRRORS[key.to_s]
        business.settings = business.settings.merge(mirror => value) if mirror
      end
      business.settings_version += 1
      business.save!
      business.settings_version
    end
  end
end

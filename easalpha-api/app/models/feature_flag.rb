class FeatureFlag < ApplicationRecord
  def self.enabled?(key, business: Current.business)
    flag = where(key: key, business_id: business&.id).first || where(key: key, business_id: nil).first
    flag&.enabled || false
  end
end

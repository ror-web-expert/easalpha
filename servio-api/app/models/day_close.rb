class DayClose < ApplicationRecord
  include Tenanted
  belongs_to :branch
  def locked? = locked_at.present? && reopened_at.nil?

  def self.locked?(branch_id, business_day)
    where(branch_id: branch_id, business_day: business_day).where.not(locked_at: nil).where(reopened_at: nil).exists?
  end
end

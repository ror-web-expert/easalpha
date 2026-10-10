class ChecklistRun < ApplicationRecord
  include Tenanted
  belongs_to :branch
  validates :kind, inclusion: { in: %w[opening closing] }

  def complete? = completed_at.present?

  def tick!(key, done, by:)
    items.each do |i|
      next unless i["key"] == key
      i["done"] = done
      i["by_membership_id"] = done ? by&.id : nil
      i["at"] = done ? Time.current.iso8601 : nil
    end
    self.done_count = items.count { |i| i["done"] }
    self.total_count = items.size
    save!
  end
end

class Station < ApplicationRecord
  include Tenanted
  belongs_to :branch
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }
end

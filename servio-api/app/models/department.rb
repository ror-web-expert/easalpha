class Department < ApplicationRecord
  include Tenanted
  has_many :employees
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }
end

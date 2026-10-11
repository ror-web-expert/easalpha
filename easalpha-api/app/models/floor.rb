class Floor < ApplicationRecord
  include Tenanted
  belongs_to :branch
  has_many :dining_tables, dependent: :nullify
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }
end

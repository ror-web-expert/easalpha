class CustomerGroup < ApplicationRecord
  include Tenanted
  has_many :customers, foreign_key: :group_id
  validates :name, presence: true, uniqueness: { scope: :business_id, conditions: -> { where(archived_at: nil) } }
  scope :active, -> { where(archived_at: nil) }
end

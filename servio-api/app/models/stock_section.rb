class StockSection < ApplicationRecord
  include Tenanted
  belongs_to :branch
  has_many :stock_levels, dependent: :destroy
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }

  def self.default_for(branch)
    active.where(branch_id: branch.id).order(is_default: :desc, sort_order: :asc).first || create!(branch: branch, name: "Kitchen", is_default: true)
  end
end

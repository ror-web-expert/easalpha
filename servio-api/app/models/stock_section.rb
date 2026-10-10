class StockSection < ApplicationRecord
  include Tenanted
  belongs_to :branch
  has_many :stock_levels, dependent: :destroy
  validates :name, presence: true
  validates :slug, presence: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/ }
  before_validation { self.slug = (slug.presence || name.to_s).parameterize }
  scope :active, -> { where(archived_at: nil) }

  # SPEC: Kitchen and Warehouse are system sections that cannot be removed; Warehouse is the COGS Primary section.
  def self.ensure_system!(branch)
    kitchen = active.find_by(branch_id: branch.id, slug: "kitchen") || active.where(branch_id: branch.id, name: "Kitchen").first ||
              create!(branch: branch, name: "Kitchen", slug: "kitchen", is_default: true, is_system: true)
    kitchen.update_columns(is_system: true) unless kitchen.is_system
    warehouse = active.find_by(branch_id: branch.id, slug: "warehouse") || create!(branch: branch, name: "Warehouse", slug: "warehouse", is_system: true, cogs_primary: true, sort_order: 1)
    warehouse.update_columns(is_system: true, cogs_primary: true) unless warehouse.is_system && warehouse.cogs_primary
    [kitchen, warehouse]
  end

  def self.default_for(branch)
    ensure_system!(branch).first.then { active.where(branch_id: branch.id).order(is_default: :desc, sort_order: :asc).first }
  end

  def self.cogs_primary_for(branch) = active.find_by(branch_id: branch.id, cogs_primary: true)
end

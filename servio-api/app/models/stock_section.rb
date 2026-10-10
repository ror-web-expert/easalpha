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
    kitchen = system_row!(branch, "Kitchen", "kitchen", is_default: true)
    warehouse = system_row!(branch, "Warehouse", "warehouse", sort_order: 1)
    # Warehouse is COGS Primary unless the branch already chose another section.
    warehouse.update_columns(cogs_primary: true) if !warehouse.cogs_primary && cogs_primary_for(branch).nil?
    [ kitchen, warehouse ]
  end

  # Finds the branch's section by slug, then by name (rows created before slugs existed), else creates it; marks it system.
  def self.system_row!(branch, name, slug, **attrs)
    row = active.find_by(branch_id: branch.id, slug: slug) || active.where(branch_id: branch.id, name: name).first ||
          create!(branch: branch, name: name, slug: slug, is_system: true, **attrs)
    fix = {}
    fix[:is_system] = true unless row.is_system
    fix[:slug] = slug if row.slug != slug
    row.update_columns(fix) if fix.any?
    row
  end
  private_class_method :system_row!

  def self.default_for(branch)
    ensure_system!(branch).first.then { active.where(branch_id: branch.id).order(is_default: :desc, sort_order: :asc).first }
  end

  def self.cogs_primary_for(branch) = active.find_by(branch_id: branch.id, cogs_primary: true)
end

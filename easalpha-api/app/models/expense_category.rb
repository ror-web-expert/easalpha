class ExpenseCategory < ApplicationRecord
  include Tenanted
  DEFAULTS = { "Utilities" => %w[Electricity Gas Water Internet], "Rent" => [], "Salaries" => %w[Advance Overtime], "Kitchen" => %w[Gas\ cylinder Repairs Cleaning], "Marketing" => [], "Transport" => %w[Fuel Rider\ expense], "Petty cash" => %w[Stationery Misc] }.freeze
  belongs_to :parent, class_name: "ExpenseCategory", optional: true
  has_many :children, class_name: "ExpenseCategory", foreign_key: :parent_id
  has_many :expenses, foreign_key: :category_id
  validates :name, presence: true
  scope :active, -> { where(archived_at: nil) }

  def self.seed_defaults!
    DEFAULTS.each_with_index do |(name, subs), i|
      parent = find_or_create_by!(name: name, parent_id: nil) { |c| c.sort_order = i }
      subs.each_with_index { |s, j| find_or_create_by!(name: s, parent_id: parent.id) { |c| c.sort_order = j } }
    end
  end

  def full_name = parent ? "#{parent.name} / #{name}" : name
end

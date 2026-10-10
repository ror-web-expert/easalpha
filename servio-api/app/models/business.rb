class Business < ApplicationRecord
  STATUSES = %w[trial active grace read_only deleted].freeze
  TRIAL_DAYS = 90

  belongs_to :plan, optional: true
  has_many :branches, dependent: :destroy
  has_many :memberships, dependent: :destroy
  has_many :users, through: :memberships
  has_many :roles, dependent: :destroy
  has_many :devices, dependent: :destroy
  has_many :subscriptions, dependent: :destroy
  has_many :setup_checklist_items, dependent: :destroy

  validates :name, :slug, :country, :currency, :time_zone, presence: true
  validates :slug, uniqueness: true, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/ }
  validates :status, inclusion: { in: STATUSES }

  def read_only? = status.in?(%w[read_only deleted])
  def trial? = status == "trial"
  def trial_days_left = trial_ends_on ? [ (trial_ends_on - Date.current).to_i, 0 ].max : 0
  def main_branch = branches.where(is_main: true).first || branches.first

  def self.generate_slug(name)
    base = name.to_s.parameterize.presence || "business"
    slug = base
    n = 1
    slug = "#{base}-#{n += 1}" while exists?(slug: slug)
    slug
  end

  DEFAULT_SETTINGS = {
    "service_charge_percent" => 0, "service_charge_order_types" => [ "dine_in" ], "cash_rounding" => 0,
    "staff_meal_requires_approval" => true, "discount_requires_reason" => true, "kitchen_ticket_print" => true,
    "default_order_type" => "walk_in", "receipt" => { "header" => "", "footer" => "Thank you", "show_logo" => true, "language" => "en", "paper" => "80" }
  }.freeze

  # The settings table (SPEC store) wins; the legacy jsonb and defaults are the fallback.
  def setting(key, default = nil)
    if Settings::Registry.valid?(key)
      row = Setting.unscoped.find_by(business_id: id, branch_id: nil, key: key.to_s)
      return row.value if row
      return settings.fetch(key.to_s) { Settings::Registry.key(key).default } if Settings::Registry.key(key).default != nil || settings.key?(key.to_s)
    end
    settings.fetch(key.to_s) { DEFAULT_SETTINGS.fetch(key.to_s, default) }
  end

  def plan_limit(key)
    (plan&.limits || {})[key.to_s]
  end
end

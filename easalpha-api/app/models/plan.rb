class Plan < ApplicationRecord
  validates :code, :name, presence: true, uniqueness: { scope: [] }
  scope :active, -> { where(active: true) }

  DEFAULTS = [
    { code: "starter", name: "Starter", price_pkr_minor: 2_500_00, price_usd_minor: 19_00, sort_order: 1,
      limits: { "tills" => 1, "staff" => 3, "branches" => 1, "whatsapp_utility_messages" => 300 },
      features: { "kitchen_display" => false, "tables" => false, "riders" => false, "inventory" => false, "tax" => false, "online_ordering" => false, "multi_branch" => false, "payroll" => false, "loyalty" => false, "aggregators" => false, "own_whatsapp_number" => false, "custom_domain" => false } },
    { code: "pro", name: "Pro", price_pkr_minor: 4_999_00, price_usd_minor: 39_00, sort_order: 2,
      limits: { "tills" => 3, "staff" => nil, "branches" => 1, "whatsapp_utility_messages" => 1000 },
      features: { "kitchen_display" => true, "tables" => true, "riders" => true, "inventory" => true, "tax" => true, "online_ordering" => true, "multi_branch" => false, "payroll" => false, "loyalty" => false, "aggregators" => false, "own_whatsapp_number" => false, "custom_domain" => false } },
    { code: "business", name: "Business", price_pkr_minor: 8_999_00, price_usd_minor: 69_00, sort_order: 3,
      limits: { "tills" => 10, "staff" => nil, "branches" => 20, "whatsapp_utility_messages" => 3000 },
      features: { "kitchen_display" => true, "tables" => true, "riders" => true, "inventory" => true, "tax" => true, "online_ordering" => true, "multi_branch" => true, "payroll" => true, "loyalty" => true, "aggregators" => true, "own_whatsapp_number" => true, "custom_domain" => true } }
  ].freeze

  def self.seed!
    DEFAULTS.each { |attrs| find_or_initialize_by(code: attrs[:code]).update!(attrs) }
  end

  def feature?(key) = features[key.to_s] == true
end

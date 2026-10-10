class SetupChecklistItem < ApplicationRecord
  include Tenanted
  DEFAULTS = [
    ["business_info", "Add your business name, logo and phone"],
    ["branch_hours", "Set opening hours and the day-end time"],
    ["menu", "Add your menu or import it"],
    ["tax", "Set tax rates and your FBR or PRA registration"],
    ["payment_methods", "Choose the payment methods you accept"],
    ["printer", "Pair a till and test the printer"],
    ["staff", "Add staff and send PINs"],
    ["tables", "Add tables if you serve dine-in"],
    ["whatsapp", "Turn on WhatsApp receipts"],
    ["first_order", "Take your first order"]
  ].freeze

  def self.create_defaults_for(business)
    DEFAULTS.each_with_index { |(key, title), i| create!(business: business, key: key, title: title, sort_order: i) }
  end

  def self.complete!(key)
    where(key: key, done_at: nil).update_all(done_at: Time.current)
  end
end

# SPEC Website Config: the storefront builder, one row per business with a section per screen.
class WebsiteConfig < ApplicationRecord
  include Tenanted
  SECTIONS = %w[identity pages menu_slider documents footer availability signups location branches delivery pricing contact social whatsapp instagram seo mobile_app system].freeze
  validates :slug, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/ }, allow_nil: true
  before_validation { self.slug = slug.to_s.parameterize.presence }

  def self.for_business!
    find_by(business_id: Current.business_id) || create!(slug: Current.business&.slug, sections: defaults(Current.business))
  end

  def self.defaults(business)
    { "identity" => { "name" => business&.name, "slug" => business&.slug, "description" => nil, "theme_color" => "#1976d2", "logo_key" => business&.logo_key, "cover_key" => nil, "favicon_key" => nil },
      "pages" => { "home" => true, "menu" => true, "about" => false, "contact" => true, "reviews" => true },
      "menu_slider" => { "items" => [] }, "documents" => { "terms" => nil, "privacy" => nil, "refund" => nil }, "footer" => { "text" => nil, "links" => [] },
      "availability" => { "online_ordering" => true, "accept_outside_hours" => false, "closed_message" => "We are closed right now" },
      "signups" => { "enabled" => true, "require_approval" => false }, "location" => { "address" => nil, "lat" => nil, "lng" => nil, "map_link" => nil },
      "branches" => { "show_picker" => false }, "delivery" => { "enabled" => true, "min_order_minor" => 0, "free_above_minor" => nil, "eta_minutes" => 45 },
      "pricing" => { "show_prices" => true, "order_type_prices" => false }, "contact" => { "phone" => business&.phone, "email" => business&.email, "whatsapp" => nil },
      "social" => { "facebook" => nil, "instagram" => nil, "tiktok" => nil, "youtube" => nil }, "whatsapp" => { "number" => nil, "greeting" => nil, "show_button" => true },
      "instagram" => { "handle" => nil, "feed" => false }, "seo" => { "title" => business&.name, "description" => nil, "keywords" => [] },
      "mobile_app" => { "android_url" => nil, "ios_url" => nil, "show_banner" => false }, "system" => { "maintenance" => false, "analytics_id" => nil } }
  end
end

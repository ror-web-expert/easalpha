module Api
  module V1
    # SPEC Website Config: the storefront builder, one section per screen.
    class WebsiteConfigController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("settings.manage", "menu.edit") }
      before_action :read_only_guard!, except: :show

      # What the store is and whether it is open: its name, address (slug), logo, publishing, maintenance, ordering hours,
      # sign-ups, delivery and price rules, and the numbers customers call. Only settings.manage changes these; menu.edit
      # keeps the content sections. A manager's slug change took the storefront offline (QA of 6 Nov 2026, P6).
      SETTINGS_SECTIONS = %w[identity availability signups delivery pricing contact whatsapp system].freeze

      def show = render(json: MarketingSerializers.website_config(WebsiteConfig.for_business!))

      # PATCH /website_config { slug?, published?, sections: { identity: {...}, ... } }  sections merge key by key
      def update
        w = WebsiteConfig.for_business!
        before = w.sections.deep_dup
        sections = params[:sections].respond_to?(:to_unsafe_h) ? params[:sections].to_unsafe_h : {}
        unknown = sections.keys.map(&:to_s) - WebsiteConfig::SECTIONS
        raise Api::Errors::BadRequest.new("website.section", "Unknown section: #{unknown.join(', ')}") if unknown.any?
        require_permission!("settings.manage") if params.key?(:slug) || params.key?(:published) || sections.keys.map(&:to_s).intersect?(SETTINGS_SECTIONS)
        merged = w.sections.deep_dup
        sections.each { |k, v| merged[k.to_s] = (merged[k.to_s] || {}).merge(v.to_h.stringify_keys) }
        attrs = { sections: merged }
        attrs[:slug] = params[:slug] if params.key?(:slug)
        attrs[:published] = ActiveModel::Type::Boolean.new.cast(params[:published]) if params.key?(:published)
        w.update!(attrs)
        audit!("settings_change", record: w, before: { sections: before.slice(*sections.keys.map(&:to_s)) }, after: { sections: merged.slice(*sections.keys.map(&:to_s)), slug: w.slug, published: w.published })
        render json: MarketingSerializers.website_config(w)
      end
    end
  end
end

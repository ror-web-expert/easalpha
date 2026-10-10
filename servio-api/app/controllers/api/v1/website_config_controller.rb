module Api
  module V1
    # SPEC Website Config: the storefront builder, one section per screen.
    class WebsiteConfigController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("settings.manage", "menu.edit") }
      before_action :read_only_guard!, except: :show

      def show = render(json: MarketingSerializers.website_config(WebsiteConfig.for_business!))

      # PATCH /website_config { slug?, published?, sections: { identity: {...}, ... } }  sections merge key by key
      def update
        w = WebsiteConfig.for_business!
        before = w.sections.deep_dup
        sections = params[:sections].respond_to?(:to_unsafe_h) ? params[:sections].to_unsafe_h : {}
        unknown = sections.keys.map(&:to_s) - WebsiteConfig::SECTIONS
        raise Api::Errors::BadRequest.new("website.section", "Unknown section: #{unknown.join(', ')}") if unknown.any?
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

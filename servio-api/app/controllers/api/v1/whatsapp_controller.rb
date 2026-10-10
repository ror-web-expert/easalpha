module Api
  module V1
    class WhatsappController < BaseController
      before_action -> { require_permission!("settings.manage") }

      def templates
        render json: { data: WhatsappTemplate.where(business_id: [nil, current_business.id]).order(:name, :language).map { |t| { id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, variables: t.variables, approval_status: t.approval_status, shared: t.business_id.nil? } } }
      end

      def messages
        scope = WhatsappMessage.where(business_id: current_business.id).order(created_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
        render_page(rows, cursor) { |m| { id: m.id, to_phone: m.to_phone, template_name: m.template_name, kind: m.kind, status: m.status, error: m.error, sent_at: m.sent_at, delivered_at: m.delivered_at, read_at: m.read_at, created_at: m.created_at } }
      end

      def usage
        render json: Billing::Lifecycle.usage(current_business)[:whatsapp_utility]
      end
    end
  end
end

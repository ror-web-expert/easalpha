module Api
  module V1
    class WhatsappController < BaseController
      before_action -> { require_permission!("settings.manage") }

      def templates
        render json: { data: WhatsappTemplate.where(business_id: [ nil, current_business.id ]).order(:name, :language).map { |t| { id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, variables: t.variables, approval_status: t.approval_status, shared: t.business_id.nil? } } }
      end

      # Link a phone by QR (WhatsApp Web style): GET /whatsapp/connection, POST /whatsapp/connection/start, POST /whatsapp/connection/logout
      def connection = render(json: connection_payload(Whatsapp::Gateway.status(current_business)))
      def start_connection = render(json: connection_payload(Whatsapp::Gateway.start!(current_business)), status: :accepted)
      def logout_connection
        r = Whatsapp::Gateway.logout!(current_business)
        audit!("settings_change", record: current_business, after: { whatsapp_phone_unlinked: true })
        render json: connection_payload(r)
      end

      def connection_payload(r)
        { provider: Whatsapp::Provider.mode(current_business), status: r[:status] || "disconnected", qr: r[:qr], phone: r[:phone], connected_at: r[:connected_at], last_error: r[:last_error],
          gateway_configured: Whatsapp::Gateway.configured?, cloud_configured: Whatsapp::Provider.cloud? }
      end

      # SPEC Templates: built from the account variables; a business template with the same name overrides the shared one.
      def variables = render(json: { data: Whatsapp::Account::VARIABLES, master_enabled: Whatsapp::Account.master_enabled? })

      def create_template
        t = WhatsappTemplate.create!(params.permit(:name, :language, :category, :body).to_h.merge(business_id: current_business.id, variables: Whatsapp::Account::VARIABLES, approval_status: "approved"))
        audit!("create", record: t, after: { name: t.name })
        render json: template_json(t), status: :created
      end

      def update_template
        t = WhatsappTemplate.where(business_id: current_business.id).find(params[:id])
        t.update!(params.permit(:name, :language, :category, :body))
        audit!("update", record: t, after: { name: t.name })
        render json: template_json(t)
      end

      def destroy_template
        WhatsappTemplate.where(business_id: current_business.id).find(params[:id]).destroy!
        head :no_content
      end

      # POST /whatsapp/send { customer_id, template, order_id?, variables?: {} }  Manual Send
      def send_one
        c = Customer.active.find(params.require(:customer_id))
        order = params[:order_id].present? ? Order.find(params[:order_id]) : nil
        extra = params[:variables].respond_to?(:to_unsafe_h) ? params[:variables].to_unsafe_h : {}
        msg = Whatsapp::Account.send!(customer: c, template_name: params.require(:template), order: order, extra: extra, actor: current_membership)
        render json: { id: msg.id, status: msg.status, to: msg.to_phone, text: msg.variables["text"] }, status: :created
      end

      # POST /whatsapp/bulk { template, customer_ids?: [], segment?: with_balance|opted_in }  Bulk Send
      def bulk
        r = Whatsapp::Account.bulk!(customer_ids: params[:customer_ids].presence, segment: params[:segment].presence, template_name: params.require(:template), actor: current_membership)
        audit!("bulk_update", record: current_business, after: { whatsapp_bulk: params[:template], sent: r[:sent], skipped: r[:skipped] })
        render json: r, status: :created
      end

      def template_json(t) = { id: t.id, name: t.name, language: t.language, category: t.category, body: t.body, variables: t.variables, approval_status: t.approval_status, shared: t.business_id.nil? }

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

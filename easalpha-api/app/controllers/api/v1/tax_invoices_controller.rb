module Api
  module V1
    class TaxInvoicesController < BaseController
      before_action -> { require_permission!("settings.manage", "reports.view_all", "reports.view_branch", "finance.view") }

      def index
        scope = TaxInvoice.where(branch_id: current_branch.id).includes(:order).order(created_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |i| serialize(i) }
      end

      def show
        render json: serialize(TaxInvoice.find(params[:id]))
      end

      def summary
        render json: Tax::Invoicer.queue_summary(branch_id: current_branch.id).merge(registered: Tax::Invoicer.registered?(current_branch), registration: current_branch.tax_registration.except("token"))
      end

      def retry
        inv = TaxInvoice.find(params[:id])
        raise Api::Errors::Conflict.new("tax.accepted", "Invoice already accepted") if inv.accepted?
        Tax::Invoicer.submit!(inv)
        render json: serialize(inv.reload)
      end

      private

      def serialize(i)
        { id: i.id, order_id: i.order_id, order_label: i.order.label, authority: i.authority, status: i.status, invoice_number: i.invoice_number, qr_payload: i.qr_payload,
          attempts: i.attempts, last_error: i.last_error, next_attempt_at: i.next_attempt_at, sent_at: i.sent_at, total_minor: i.request_payload["total_minor"], created_at: i.created_at }
      end
    end
  end
end

module Api
  module V1
    module Super
      class BillingController < BaseController
        before_action :authenticate_super!

        def invoices
          scope = Invoice.unscoped.includes(:business).order(created_at: :desc)
          scope = scope.where(status: params[:status]) if params[:status].present?
          rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
          render_page(rows, cursor) { |i| { id: i.id, number: i.number, business: { id: i.business.id, name: i.business.name, slug: i.business.slug }, amount_minor: i.amount_minor, currency: i.currency, status: i.status, due_on: i.due_on, payment_method: i.payment_method, payment_reference: i.payment_reference, reported_at: i.reported_at } }
        end

        # POST /super/invoices/:id/confirm
        def confirm
          inv = Invoice.unscoped.find(params[:id])
          Tenancy::Context.with(inv.business) do
            Billing::Issuer.confirm!(Invoice.find(inv.id), by_super_admin: @super_admin)
            AuditLog.record(action: "update", record: inv, after: { confirmed_by: @super_admin.email }, business: inv.business)
          end
          render json: { id: inv.id, status: "paid", business_status: inv.business.reload.status }
        end

        def run_lifecycle
          BillingLifecycleJob.perform_now(params[:business_id].presence)
          head :no_content
        end
      end
    end
  end
end

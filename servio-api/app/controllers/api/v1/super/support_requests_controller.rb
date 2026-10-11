module Api
  module V1
    module Super
      # The product owner's support inbox: every business's requests, reply and close. A reply notifies the business.
      class SupportRequestsController < BaseController
        before_action :authenticate_super!

        def index
          scope = SupportRequest.open_first.includes(:business, membership: :user)
          scope = scope.where(status: params[:status]) if params[:status].present?
          scope = scope.where(business_id: params[:business_id]) if params[:business_id].present?
          rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit])
          render_page(rows, cursor) { |r| serialize(r) }
        end

        def reply
          r = SupportRequest.find(params[:id])
          r.update!(reply: params.require(:reply), replied_by_super_admin_id: @super_admin.id, replied_at: Time.current, status: "answered")
          Tenancy::Context.with(r.business) do
            Notification.create!(kind: "support_reply", user_id: r.membership&.user_id, title: "EasAlpha support replied: #{r.subject}", body: r.reply.to_s.truncate(200), link: "/admin/support")
            AuditLog.record(action: "update", record: r, after: { replied_by: @super_admin.email }, business: r.business)
          end
          render json: serialize(r)
        end

        def close
          r = SupportRequest.find(params[:id])
          r.update!(status: "closed", closed_at: Time.current)
          render json: serialize(r)
        end

        private

        def serialize(r)
          { id: r.id, business: { id: r.business.id, name: r.business.name, slug: r.business.slug, status: r.business.status },
            by: r.membership && { id: r.membership.id, name: r.membership.user&.name, email: r.membership.user&.email },
            subject: r.subject, message: r.message, category: r.category, status: r.status, page: r.page,
            reply: r.reply, replied_at: r.replied_at, closed_at: r.closed_at, created_at: r.created_at }
        end
      end
    end
  end
end

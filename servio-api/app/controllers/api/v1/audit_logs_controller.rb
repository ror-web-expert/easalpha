module Api
  module V1
    class AuditLogsController < BaseController
      before_action -> { require_permission!("audit.view", "reports.view_all") }

      def index
        scope = AuditLog.where(business_id: current_business.id)
        scope = scope.where(action: params[:action_name]) if params[:action_name].present?
        scope = scope.where(table_name: params[:table_name]) if params[:table_name].present?
        scope = scope.where(record_id: params[:record_id]) if params[:record_id].present?
        scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :occurred_at)
        render_page(rows, cursor) { |a| Serializers.audit_log(a) }
      end
    end
  end
end

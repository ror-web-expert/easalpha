module Api
  module V1
    # SPEC Audit Logs: filter by date range, actor, action and entity; a Search Insights tab; CSV through /exports/audit_logs.
    class AuditLogsController < BaseController
      before_action -> { require_permission!("audit.view", "reports.view_all") }

      def index
        rows, cursor = Paginator.call(filtered, cursor: params[:cursor], limit: params[:limit], order_column: :occurred_at)
        names = User.where(id: rows.flat_map { |a| [ a.user_id, a.approved_by_user_id ] }.compact.uniq).pluck(:id, :name).to_h
        render_page(rows, cursor) { |a| Serializers.audit_log(a, names: names) }
      end

      # GET /audit_logs/entities  the entity types seen in this business, for the filter
      def entities
        render json: { data: AuditLog.where(business_id: current_business.id).distinct.order(:table_name).pluck(:table_name).compact,
                       actions: AuditLog::ACTIONS }
      end

      # GET /audit_logs/insights?from&to  counts by action, actor and entity for the range
      def insights
        scope = filtered
        by_user = scope.group(:user_id).count
        names = User.where(id: by_user.keys.compact).pluck(:id, :name).to_h
        render json: {
          total: scope.count,
          by_action: scope.group(:action).order(Arel.sql("count_all desc")).count,
          by_entity: scope.group(:table_name).order(Arel.sql("count_all desc")).limit(30).count,
          by_actor: by_user.sort_by { |id, n| [ -n, id.nil? ? 1 : 0, id.to_s ] }.first(30).map { |id, n| { user_id: id, name: names[id] || (id ? "Unknown" : "System"), count: n } },
          by_day: scope.group(Arel.sql("date_trunc('day', occurred_at)")).order(Arel.sql("date_trunc('day', occurred_at)")).count.transform_keys { |d| d.to_date.iso8601 }
        }
      end

      private

      def filtered
        scope = AuditLog.where(business_id: current_business.id)
        scope = scope.where(action: params[:action_name]) if params[:action_name].present?
        scope = scope.where(table_name: params[:table_name]) if params[:table_name].present?
        scope = scope.where(record_id: params[:record_id]) if params[:record_id].present?
        scope = scope.where(user_id: params[:user_id]) if params[:user_id].present?
        scope = scope.where("occurred_at >= ?", Date.parse(params[:from]).beginning_of_day) if params[:from].present?
        scope = scope.where("occurred_at <= ?", Date.parse(params[:to]).end_of_day) if params[:to].present?
        scope
      end
    end
  end
end

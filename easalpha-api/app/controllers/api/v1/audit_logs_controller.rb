module Api
  module V1
    # SPEC Audit Logs: filter by date range, actor, action and entity; a Search Insights tab; CSV through /exports/audit_logs.
    class AuditLogsController < BaseController
      before_action -> { require_permission!("audit.view", "reports.view_all") }

      def index
        rows, cursor = Paginator.call(filtered, cursor: params[:cursor], limit: params[:limit], order_column: :occurred_at)
        names = User.where(id: rows.flat_map { |a| [ a.user_id, a.approved_by_user_id ] }.compact.uniq).pluck(:id, :name).to_h
        support_names = SuperAdmin.where(id: rows.map(&:super_admin_id).compact.uniq).pluck(:id, :name).to_h
        render_page(rows, cursor) { |a| Serializers.audit_log(a, names: names, support_names: support_names) }
      end

      # GET /audit_logs/entities  the entity types seen in this business and every action with its label, for the filter.
      # entity_labels names each table as a person reads it ("Order items", "Staff"), not as the database does (S13).
      def entities
        tables = AuditLog.where(business_id: current_business.id).distinct.order(:table_name).pluck(:table_name).compact
        render json: { data: tables, entity_labels: tables.to_h { |t| [ t, AuditLog.entity_label(t) ] },
                       actions: AuditLog::ACTIONS, action_labels: AuditLog::ACTION_LABELS }
      end

      # GET /audit_logs/insights?from&to  counts by action, actor and entity for the range. A support person's rows
      # (super_admin_id, no user) are named as the list names them, not counted in with "System" (L2, 7 Nov 2026).
      def insights
        scope = filtered
        by_actor = scope.group(:user_id, :super_admin_id).count
        names = User.where(id: by_actor.keys.map(&:first).compact).pluck(:id, :name).to_h
        support_names = SuperAdmin.where(id: by_actor.keys.map(&:last).compact).pluck(:id, :name).to_h
        actor = ->(uid, sid) { Serializers.audit_actor(uid, sid, names: names, support_names: support_names) || (uid ? "Unknown" : "System") }
        render json: {
          total: scope.count,
          by_action: scope.group(:action).order(Arel.sql("count_all desc")).count,
          by_entity: scope.group(:table_name).order(Arel.sql("count_all desc")).limit(30).count,
          by_actor: by_actor.sort_by { |(uid, sid), n| [ -n, uid || sid ? 0 : 1, uid.to_s, sid.to_s ] }.first(30)
                            .map { |(uid, sid), n| { user_id: uid, super_admin_id: sid, name: actor.(uid, sid), count: n } },
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

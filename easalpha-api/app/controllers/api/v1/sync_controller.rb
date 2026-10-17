module Api
  module V1
    class SyncController < BaseController
      before_action :require_device!

      # POST /sync/push  records: [...]
      def push
        raw = params[:records]
        raw = raw.to_unsafe_h.values if raw.respond_to?(:to_unsafe_h)
        records = Array(raw).map { |r| r.respond_to?(:to_unsafe_h) ? r.to_unsafe_h : r.to_h }
        raise Api::Errors::BadRequest.new("sync.empty", "No records") if records.empty?
        raise Api::Errors::BadRequest.new("sync.too_many", "At most 200 records per batch") if records.size > 200
        render json: Sync::Push.new(device: current_device, branch: current_branch, actor: current_membership).call(records)
      end

      # GET /sync/changes?since=
      def changes
        since = params[:since].present? ? Time.iso8601(params[:since].to_s) : nil
        render json: Sync::Changes.call(branch: current_branch, since: since, device: current_device)
      rescue ArgumentError
        raise Api::Errors::BadRequest.new("sync.cursor", "since must be an ISO 8601 time")
      end

      # GET /sync/customers?after=&limit=  every customer the till can search while offline, by id, up to 1,000 a page.
      # /sync/changes then keeps the copy current (it sends only the customers changed since the cursor).
      def customers
        limit = (params[:limit].presence || 1000).to_i.clamp(1, 1000)
        scope = Customer.active.where(is_walk_in: false).reorder(:id)
        scope = scope.where("customers.id > ?", params[:after].to_s) if params[:after].present?
        rows = scope.limit(limit).to_a
        render json: { data: rows.map { |c| CustomerSerializers.customer(c) }, next_after: rows.size == limit ? rows.last.id : nil, generated_at: Time.current }
      end

      # GET /sync/rejections  the needs-attention list
      def rejections
        scope = SyncRejection.where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.open unless params[:include_resolved] == "true"
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |r| { id: r.id, device_id: r.device_id, record_type: r.record_type, record_id: r.record_id, code: r.code, message: r.message, payload: r.payload, resolved_at: r.resolved_at, resolution: r.resolution, created_at: r.created_at } }
      end

      def resolve
        authenticate!
        r = SyncRejection.where(branch_id: current_branch.id).find(params[:id])
        r.update!(resolved_at: Time.current, resolved_by_membership_id: current_membership.id, resolution: params[:resolution].presence || "dismissed")
        audit!("update", record: r, after: { resolved: true, resolution: r.resolution })
        head :no_content
      end

      def batches
        rows, cursor = Paginator.call(SyncBatch.where(branch_id: current_branch.id), cursor: params[:cursor], limit: params[:limit], order_column: :started_at)
        render_page(rows, cursor) { |b| { id: b.id, device_id: b.device_id, direction: b.direction, record_count: b.record_count, accepted: b.accepted, duplicates: b.duplicates, rejected: b.rejected, started_at: b.started_at, finished_at: b.finished_at } }
      end

      private

      def require_device!
        return if current_device&.paired?
        authenticate!
        raise Api::Errors::Forbidden.new("device.required", "Sync needs a paired device") if action_name.in?(%w[push])
      end
    end
  end
end

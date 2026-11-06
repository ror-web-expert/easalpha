module Api
  module V1
    class SyncController < BaseController
      before_action :require_device!
      before_action :read_only_guard!, only: :push

      # POST /sync/push  records: [...]
      def push
        records = push_records
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

      # POST /sync/rejections/:id/resolve. The admin's Needs attention resolves one row by its id. A till's Dismiss names
      # the record it dropped (the id it holds for it): that record's open refusals from this till are resolved (K7), all
      # of them for whoever sees the whole Attention list there, a member's own records for anyone else (QA K8).
      def resolve
        authenticate!
        rows = if till_dismissal?
          SyncRejection.open.where(branch_id: current_branch.id, device_id: current_device.id).where("sync_rejections.record_id::text = :id OR sync_rejections.id::text = :id", id: params[:id].to_s)
                       .select { |r| sees_whole_attention_list? || r.payload["membership_id"] == current_membership.id }
        else
          [ SyncRejection.where(branch_id: current_branch.id).find(params[:id]) ]
        end
        rows.each do |r|
          r.update!(resolved_at: Time.current, resolved_by_membership_id: current_membership.id, resolution: params[:resolution].presence || "dismissed")
          audit!("update", record: r, after: { resolved: true, resolution: r.resolution })
        end
        head :no_content
      end

      # POST /sync/rejections/check  records: [{ type, id }], the refusals the till still lists on its Attention page.
      # Answers those resolved here since (a manager's Dismiss or Mark fixed on Needs attention, or the record went
      # through after all), so the till drops them too: before, they stayed there after the admin had settled them
      # (L3, 7 Nov 2026). Only this till's rows count, and a record refused again after a resolution is open again.
      def check
        asked = checked_records
        rows = SyncRejection.where(device_id: current_device.id, record_type: asked.map(&:first).uniq, record_id: asked.map(&:last).uniq).group_by { |r| [ r.record_type, r.record_id ] }
        resolved = asked.filter_map do |key|
          found = rows[key]
          next if found.blank? || found.any? { |r| r.resolved_at.nil? }
          last = found.max_by(&:resolved_at)
          { type: last.record_type, id: last.record_id, resolution: last.resolution, resolved_at: last.resolved_at }
        end
        render json: { resolved: resolved }
      end

      def batches
        rows, cursor = Paginator.call(SyncBatch.where(branch_id: current_branch.id), cursor: params[:cursor], limit: params[:limit], order_column: :started_at)
        render_page(rows, cursor) { |b| { id: b.id, device_id: b.device_id, direction: b.direction, record_count: b.record_count, accepted: b.accepted, duplicates: b.duplicates, rejected: b.rejected, started_at: b.started_at, finished_at: b.finished_at } }
      end

      private

      TILL_KINDS = %w[till tablet kiosk].freeze

      # Pushing is the till's alone, and only while a cashier is signed in on it: the device token names nobody, so
      # money it pushed alone could be anyone's (review of 6 Nov 2026, A1). A locked till gets session.required and
      # keeps its queue until someone signs in. A canteen kiosk has no cashier; its meal claims are the one record it
      # pushes by itself. The catalogue and customer downloads belong to a till too, or to a POS session of someone
      # who takes orders; a kitchen or rider token gets neither. The needs-attention lists are for managers.
      def require_device!
        till = current_device&.paired? && current_device.kind.in?(TILL_KINDS)
        case action_name
        when "push"
          raise Api::Errors::Forbidden.new("device.required", "Sync needs a paired till") unless till
          raise Api::Errors::Forbidden.new("session.required", "Sign in on the till to sync") unless current_membership || kiosk_claims_only?
        when "resolve"
          # The till's Attention page dismisses what this till sent; the admin needs a manager's permission.
          require_permission!("settings.manage", "devices.manage", "reports.view_all", "reports.view_branch") unless till_dismissal?
        when "check"
          # About the till's own refusals only, so the till alone asks, locked or not: it learns nothing about anyone.
          raise Api::Errors::Forbidden.new("device.required", "Sync needs a paired till") unless till
        when "changes", "customers"
          return if till
          raise Api::Errors::Forbidden.new("device.required", "Sync needs a paired till") if current_device&.paired? # a kitchen screen or rider phone
          authenticate!
          pos_session = @claims[:app].to_s == "pos" && %w[orders.create customers.view].any? { |c| current_membership.can?(c) }
          raise Api::Errors::Forbidden.new("device.required", "Sync needs a paired till") unless pos_session
        else
          require_permission!("settings.manage", "devices.manage", "reports.view_all", "reports.view_branch")
        end
      end

      def push_records
        @push_records ||= begin
          raw = params[:records]
          raw = raw.to_unsafe_h.values if raw.respond_to?(:to_unsafe_h)
          Array(raw).map { |r| r.respond_to?(:to_unsafe_h) ? r.to_unsafe_h : r.to_h }
        end
      end

      # The [type, id] pairs a check asks about (the records parameter, as a push reads it), at most 200; an id that is
      # not a UUID was never kept under it.
      def checked_records
        raise Api::Errors::BadRequest.new("sync.too_many", "At most 200 records per check") if push_records.size > 200
        push_records.filter_map do |r|
          r = r.with_indifferent_access
          [ r[:type].to_s, r[:id].to_s.downcase ] if r[:id].to_s.match?(Sync::Push::UUID)
        end.uniq
      end

      # A Dismiss on a till, by the member signed in on it: only what this till sent is resolved.
      def till_dismissal?
        current_device&.paired? && current_device.kind.in?(TILL_KINDS) && current_membership&.active?
      end

      # As the till's Attention page decides it: OFFLINE_ORDERS or settings.manage, as the session carries them.
      def sees_whole_attention_list? = (%w[OFFLINE_ORDERS settings.manage] & current_membership.permission_codes).any?

      def kiosk_claims_only?
        current_device.kind == "kiosk" && push_records.all? { |r| r.with_indifferent_access[:type].to_s == "meal_claim" }
      end
    end
  end
end

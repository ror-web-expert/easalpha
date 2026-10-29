module Api
  module V1
    # Canteen (factory mess): the kiosk and the counter screen work with a paired device (kiosk, till, tablet or token
    # screen) or a staff login; plans, sessions, workers and reports need canteen.manage. Everything needs the module.
    class CanteenController < BaseController
      KIOSK_ACTIONS = %w[today sync claim claims serve workers worker lookup].freeze
      DEVICE_KINDS = %w[kiosk till tablet token_screen].freeze

      before_action :require_canteen!
      before_action :read_only_guard!, only: %i[claim serve cancel link_workers enrol_worker create_session update_session destroy_session save_plan copy_plans publish_plan unpublish_plan destroy_plan]

      # GET /canteen/today?date=  the kiosk's and the counter's view: the session now, the day's plans, the counts.
      def today
        date = params[:date].present? ? Date.parse(params[:date].to_s) : today_date
        session = Canteen::Sessions.current(current_branch)
        plans = Canteen::Plans.for_day(current_branch, date)
        claims = MealClaim.live.where(branch_id: current_branch.id, plan_date: date)
        render json: { date: date, now: Time.current, branch: { id: current_branch.id, name: current_branch.name }, session: session && CanteenSerializers.session(session),
                       sessions: MealSession.active.where(branch_id: current_branch.id).order(:sort_order, :starts_at).map { |s| CanteenSerializers.session(s) },
                       plans: plans.map { |p| CanteenSerializers.plan(p) }, counts: { claimed: claims.count, served: claims.where(status: "served").count, workers: Employee.active.count },
                       settings: { manual_lookup: current_business.setting("canteen.manual_lookup") != false, print_token: current_business.setting("canteen.print_token") != false } }
      rescue Date::Error
        raise Api::Errors::BadRequest.new("canteen.date", "date must be YYYY-MM-DD")
      end

      # GET /canteen/sync  what a kiosk keeps locally: sessions, today's published plans, every worker and today's claims
      def sync
        render json: Canteen::Sync.payload(current_branch)
      end

      # POST /canteen/claims { id?, fingerprint_id | employee_id, meal_plan_item_id, meal_session_id?, token_label?, source?, client_created_at? }
      def claim
        c = Canteen::Claims.claim!(branch: current_branch, device: current_device, actor: current_membership, id: params[:id].presence, fingerprint_id: params[:fingerprint_id], employee_id: params[:employee_id],
                                   meal_plan_item_id: params[:meal_plan_item_id], meal_session_id: params[:meal_session_id], token_label: params[:token_label], source: params[:source], client_created_at: params[:client_created_at])
        render json: CanteenSerializers.claim(c), status: :created
      end

      # GET /canteen/claims?date=&session_id=&status=&q=  the counter's list and the admin's
      def claims
        date = params[:date].present? ? Date.parse(params[:date].to_s) : today_date
        scope = MealClaim.includes(:meal_session, :employee, meal_plan_item: :product).where(branch_id: current_branch.id, plan_date: date)
        scope = scope.where(meal_session_id: params[:session_id]) if params[:session_id].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where("meal_claims.token_label ILIKE :q", q: "%#{params[:q].to_s.strip}%") if params[:q].present?
        rows = scope.order(scanned_at: :desc).limit((params[:limit].presence || 500).to_i.clamp(1, 2000))
        render json: { date: date, data: rows.map { |c| CanteenSerializers.claim(c) } }
      end

      def serve
        c = MealClaim.where(branch_id: current_branch.id).find(params[:id])
        render json: CanteenSerializers.claim(Canteen::Claims.serve!(c, by: current_membership, device: current_device))
      end

      def cancel
        require_permission!("canteen.manage")
        c = MealClaim.find(params[:id])
        render json: CanteenSerializers.claim(Canteen::Claims.cancel!(c, by: current_membership, reason: params[:reason].to_s.strip))
      end

      # GET /canteen/workers?q=  the kiosk's manual lookup (when allowed) and the admin's worker list
      def workers
        if params[:q].present?
          raise Api::Errors::Forbidden.new("canteen.manual_lookup", "Manual lookup is switched off") if current_membership.nil? && current_business.setting("canteen.manual_lookup") == false
          rows = Canteen::Workers.search(params[:q])
          render json: { data: rows.map { |e| CanteenSerializers.worker(e) } }
        else
          rows = Employee.active.includes(:department).order(:name)
          render json: { data: rows.map { |e| CanteenSerializers.worker(e) }, linked: rows.count { |e| e.customer_id.present? }, enrolled: rows.count(&:fingerprint_enrolled) }
        end
      end

      def worker
        e = Employee.active.includes(:department).find(params[:id])
        from = params[:from].present? ? Date.parse(params[:from]) : today_date.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : today_date
        render json: Canteen::Reports.worker(e, from: from, to: to).merge(worker: CanteenSerializers.worker(e))
      end

      # POST /canteen/workers/link { employee_ids: [...] } or { all: true }
      def link_workers
        if ActiveModel::Type::Boolean.new.cast(params[:all])
          render json: { linked: Canteen::Workers.link_all! }
        else
          ids = Array(params[:employee_ids])
          Employee.active.where(id: ids).find_each { |e| Canteen::Workers.link!(e) }
          render json: { linked: ids.size }
        end
      end

      # POST /canteen/workers/:id/fingerprint { fingerprint_id }   the reader's id for this worker (same as attendance enrol)
      def enrol_worker
        e = Employee.active.find(params[:id])
        fid = params.require(:fingerprint_id).to_s.strip
        raise Api::Errors::Conflict.new("attendance.fingerprint_taken", "That fingerprint is enrolled for another worker") if Employee.active.where(fingerprint_id: fid).where.not(id: e.id).exists?
        e.update!(fingerprint_id: fid, fingerprint_enrolled: true, fingerprint_enrolled_at: Time.current, fingerprint_revoked_at: nil)
        Canteen::Workers.link!(e)
        render json: CanteenSerializers.worker(e.reload)
      end

      # ---- sessions ----
      def sessions
        Canteen::Sessions.seed_defaults!(current_branch) if ActiveModel::Type::Boolean.new.cast(params[:seed])
        render json: { data: MealSession.where(branch_id: current_branch.id).order(:sort_order, :starts_at).map { |s| CanteenSerializers.session(s) } }
      end

      def create_session
        s = MealSession.create!(branch: current_branch, **session_attrs)
        audit!("create", record: s, after: session_attrs)
        render json: CanteenSerializers.session(s), status: :created
      end

      def update_session
        s = MealSession.where(branch_id: current_branch.id).find(params[:id])
        s.update!(session_attrs)
        render json: CanteenSerializers.session(s)
      end

      def destroy_session
        s = MealSession.where(branch_id: current_branch.id).find(params[:id])
        raise Api::Errors::Conflict.new("canteen.session_in_use", "This session has meal plans; switch it off instead") if s.meal_plans.exists?
        s.destroy!
        head :no_content
      end

      # ---- plans ----
      # GET /canteen/plans?from=&to=   every plan of the branch in the range (default: this week)
      def plans
        from = params[:from].present? ? Date.parse(params[:from]) : today_date
        to = params[:to].present? ? Date.parse(params[:to]) : from + 6
        rows = MealPlan.includes(:meal_session, items: :product).where(branch_id: current_branch.id, plan_date: from..to).order(:plan_date)
        render json: { from: from, to: to, data: rows.sort_by { |p| [ p.plan_date, p.meal_session.sort_order ] }.map { |p| CanteenSerializers.plan(p) } }
      end

      # POST /canteen/plans { meal_session_id, plan_date, items: [{ product_id, planned_qty, worker_price_minor }], notes, publish }
      def save_plan
        session = MealSession.where(branch_id: current_branch.id).find(params.require(:meal_session_id))
        plan = Canteen::Plans.save!(branch: current_branch, session: session, date: Date.parse(params.require(:plan_date).to_s), items: params[:items], notes: params[:notes], actor: current_membership)
        Canteen::Plans.publish!(plan) if ActiveModel::Type::Boolean.new.cast(params[:publish])
        audit!("update", record: plan, after: { items: plan.items.size, status: plan.status })
        render json: CanteenSerializers.plan(plan.reload)
      end

      def publish_plan
        plan = MealPlan.includes(items: :product).where(branch_id: current_branch.id).find(params[:id])
        render json: CanteenSerializers.plan(Canteen::Plans.publish!(plan))
      end

      def unpublish_plan
        plan = MealPlan.where(branch_id: current_branch.id).find(params[:id])
        render json: CanteenSerializers.plan(Canteen::Plans.unpublish!(plan))
      end

      def destroy_plan
        plan = MealPlan.where(branch_id: current_branch.id).find(params[:id])
        raise Api::Errors::Conflict.new("canteen.plan_in_use", "Meals were already claimed from this plan") if plan.claims.live.exists?
        plan.destroy!
        head :no_content
      end

      # POST /canteen/plans/copy { from, to }
      def copy_plans
        copied = Canteen::Plans.copy!(branch: current_branch, from: Date.parse(params.require(:from).to_s), to: Date.parse(params.require(:to).to_s), actor: current_membership)
        render json: { copied: copied }
      end

      # ---- reports ----
      # GET /canteen/reports/summary?from=&to=&group_by=day|session|dish|department[&csv=1]
      def summary
        r = Canteen::Reports.summary(branch: current_branch, from: range.begin, to: range.end, group_by: params[:group_by])
        return render_csv("canteen-#{r[:group_by]}-#{r[:from]}-#{r[:to]}.csv", r[:rows], [ { label: r[:group_by].capitalize, value: ->(x) { x[:key] } }, { label: "Meals", value: ->(x) { x[:meals] } }, { label: "Served", value: ->(x) { x[:served] } }, { label: "Planned", value: ->(x) { x[:planned] } }, { label: "Workers", value: ->(x) { x[:workers] } }, { label: "Worker share", value: ->(x) { x[:worker_minor] / 100.0 } }, { label: "Company share", value: ->(x) { x[:company_minor] / 100.0 } }, { label: "Total", value: ->(x) { x[:total_minor] / 100.0 } } ]) if csv?
        render json: r
      end

      # GET /canteen/reports/workers?from=&to=[&csv=1]
      def workers_report
        r = Canteen::Reports.workers(branch: current_branch, from: range.begin, to: range.end)
        return render_csv("canteen-workers-#{r[:from]}-#{r[:to]}.csv", r[:rows], [ { label: "Worker", value: ->(x) { x[:name] } }, { label: "Department", value: ->(x) { x[:department] } }, { label: "Meals", value: ->(x) { x[:meals] } }, { label: "Worker share", value: ->(x) { x[:worker_minor] / 100.0 } }, { label: "Company share", value: ->(x) { x[:company_minor] / 100.0 } }, { label: "Last meal", value: ->(x) { x[:last_meal_at] } } ]) if csv?
        render json: r
      end

      private

      def require_canteen!
        BusinessModules.require!(current_business, "canteen") if current_business
        return if current_device&.paired? && current_device.kind.in?(DEVICE_KINDS) && action_name.in?(KIOSK_ACTIONS)
        authenticate!
        BusinessModules.require!(current_business, "canteen")
        require_permission!(*(action_name.in?(KIOSK_ACTIONS) ? %w[canteen.serve canteen.manage orders.create] : %w[canteen.manage]))
      end

      def session_attrs
        p = params.permit(:name, :starts_at, :ends_at, :max_claims, :active, :sort_order).to_h.symbolize_keys
        p[:max_claims] = p[:max_claims].to_i if p.key?(:max_claims)
        p[:active] = ActiveModel::Type::Boolean.new.cast(p[:active]) if p.key?(:active)
        p
      end

      def today_date = current_branch.business_day_for(Time.current)
      def csv? = params[:csv].present? || params[:format].to_s == "csv"

      def render_csv(filename, rows, columns)
        send_data Canteen::Reports.csv(rows, columns), filename: filename, type: "text/csv"
      end
    end
  end
end

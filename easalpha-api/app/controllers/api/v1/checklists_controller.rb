module Api
  module V1
    # Opening and closing checklists: a template per branch (or business) and one run per branch, day and kind.
    class ChecklistsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("app.pos", "shifts.own", "shifts.any", "settings.manage") }

      # GET /checklists/templates
      def templates
        render json: { data: %w[opening closing].map { |k| template_json(ChecklistTemplate.for(k, branch_id: current_branch.id)) } }
      end

      # PUT /checklists/templates/:kind { items: [{key?, label}], required_for_shift, branch_id? }
      def update_template
        require_permission!("settings.manage")
        kind = params[:kind].to_s
        raise Api::Errors::BadRequest.new("checklist.kind", "kind must be opening or closing") unless kind.in?(%w[opening closing])
        t = ChecklistTemplate.find_or_initialize_by(kind: kind, branch_id: params[:branch_id].presence)
        items = Array(params[:items]).each_with_index.map { |i, idx| i = i.respond_to?(:to_unsafe_h) ? i.to_unsafe_h : i.to_h; { "key" => i["key"].presence || "item_#{idx + 1}", "label" => i["label"].to_s } }
        t.update!(items: items, required_for_shift: ActiveModel::Type::Boolean.new.cast(params[:required_for_shift]))
        render json: template_json(t)
      end

      # GET /checklists/today?kind=opening  returns (and starts) today's run
      def today
        kind = params[:kind].presence_in(%w[opening closing]) || "opening"
        render json: run_json(run_for(kind))
      end

      # POST /checklists/runs/:id/tick { key, done }
      def tick
        run = ChecklistRun.find(params[:id])
        raise Api::Errors::Conflict.new("checklist.complete", "This checklist is already complete") if run.complete?
        run.tick!(params.require(:key), ActiveModel::Type::Boolean.new.cast(params[:done]), by: current_membership)
        render json: run_json(run)
      end

      def complete
        run = ChecklistRun.find(params[:id])
        raise Api::Errors::Conflict.new("checklist.incomplete", "#{run.total_count - run.done_count} item(s) still open") if run.done_count < run.total_count
        run.update!(completed_at: Time.current, completed_by_membership_id: current_membership.id)
        audit!("checklist_complete", record: run, after: { kind: run.kind, business_day: run.business_day })
        render json: run_json(run)
      end

      # GET /checklists/runs?from=&to=
      def runs
        from = params[:from].present? ? Date.parse(params[:from]) : business_today - 7
        to = params[:to].present? ? Date.parse(params[:to]) : business_today
        render json: { data: ChecklistRun.where(branch_id: current_branch.id, business_day: from..to).order(business_day: :desc, kind: :asc).map { |r| run_json(r) } }
      end

      private

      def run_for(kind)
        day = current_branch.business_day_for(Time.current)
        ChecklistRun.find_by(branch_id: current_branch.id, business_day: day, kind: kind) || begin
          t = ChecklistTemplate.for(kind, branch_id: current_branch.id)
          ChecklistRun.create!(branch: current_branch, kind: kind, business_day: day, shift_id: current_shift&.id, items: t.items.map { |i| i.merge("done" => false) }, total_count: t.items.size, started_by_membership_id: current_membership.id)
        end
      end

      def template_json(t) = { id: t.id, kind: t.kind, branch_id: t.branch_id, items: t.items, required_for_shift: t.required_for_shift }
      def run_json(r) = { id: r.id, kind: r.kind, business_day: r.business_day, shift_id: r.shift_id, items: r.items, done_count: r.done_count, total_count: r.total_count, completed_at: r.completed_at, completed_by_membership_id: r.completed_by_membership_id }
    end
  end
end

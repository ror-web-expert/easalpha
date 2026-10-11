module Api
  module V1
    class ReportSchedulesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("reports.view_all", "settings.manage") }

      def index = render(json: { data: ReportSchedule.order(:name).map { |s| serialize(s) } })

      def create
        s = ReportSchedule.create!(schedule_params.merge(created_by_membership_id: current_membership.id))
        audit!("create", record: s, after: { name: s.name, kind: s.kind })
        render json: serialize(s), status: :created
      end

      def update
        s = ReportSchedule.find(params[:id])
        s.update!(schedule_params.merge(next_run_at: nil))
        render json: serialize(s)
      end

      def destroy
        ReportSchedule.find(params[:id]).destroy!
        head :no_content
      end

      def preview = render(json: { text: Reports::Scheduled.text_for(ReportSchedule.find(params[:id])) })

      # POST /report_schedules/:id/run  sends now
      def run
        s = ReportSchedule.find(params[:id])
        result = Reports::Scheduled.deliver!(s)
        s.mark_run!
        render json: result.merge(schedule: serialize(s.reload))
      end

      private

      def schedule_params
        p = params.permit(:branch_id, :name, :kind, :cadence, :hour, :weekday, :day_of_month, :channel, :active, recipients: [])
        p[:recipients] = Array(p[:recipients]).map(&:to_s).map(&:strip).reject(&:blank?) if p.key?(:recipients)
        p
      end

      def serialize(s)
        { id: s.id, branch_id: s.branch_id, name: s.name, kind: s.kind, cadence: s.cadence, hour: s.hour, weekday: s.weekday, day_of_month: s.day_of_month, channel: s.channel, recipients: s.recipients,
          active: s.active, last_run_at: s.last_run_at, next_run_at: s.next_run_at, last_error: s.last_error }
      end
    end
  end
end

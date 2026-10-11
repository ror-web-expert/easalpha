module Api
  module V1
    class DayClosesController < BaseController
      before_action -> { require_permission!("shifts.any", "reports.view_all", "reports.view_branch") }

      def show
        day = params[:business_day].presence || current_branch.business_day_for(Time.current)
        render json: Shifts::DayCloser.status(current_branch, Date.parse(day.to_s))
      end

      def lock
        require_permission!("shifts.any")
        read_only_guard!
        day = Date.parse(params.require(:business_day).to_s)
        close = Shifts::DayCloser.lock!(current_branch, day, by: current_membership, force: ActiveModel::Type::Boolean.new.cast(params[:force]))
        render json: Shifts::DayCloser.status(current_branch, day).merge(locked_at: close.locked_at)
      end

      def reopen
        require_permission!("shifts.any")
        day = Date.parse(params.require(:business_day).to_s)
        Shifts::DayCloser.reopen!(current_branch, day, by: current_membership, reason: params[:reason])
        render json: Shifts::DayCloser.status(current_branch, day)
      end
    end
  end
end

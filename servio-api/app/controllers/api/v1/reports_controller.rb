module Api
  module V1
    class ReportsController < BaseController
      before_action -> { require_permission!("reports.view_all", "reports.view_branch", "reports.view_own") }
      before_action :set_range, except: :dashboard

      def dashboard
        require_permission!("reports.view_all", "reports.view_branch")
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : nil
        render json: Reports::Dashboard.build(current_branch, day)
      end

      def overview = render(json: report.overview)
      def by_day = render(json: { from: @from, to: @to, data: report.by_day })
      def by_hour = render(json: { from: @from, to: @to, data: report.by_hour })
      def items = render(json: { from: @from, to: @to, data: report.items(limit: (params[:limit].presence || 50).to_i) })
      def categories = render(json: { from: @from, to: @to, data: report.categories })
      def cashiers = render(json: { from: @from, to: @to, data: report.cashiers })
      def order_takers = render(json: { from: @from, to: @to, data: report.order_takers })
      def voids = render(json: report.voids.merge(from: @from, to: @to))
      def discounts = render(json: report.discounts.merge(from: @from, to: @to))
      def modified = render(json: { from: @from, to: @to, data: report.modified })
      def customers = render(json: { from: @from, to: @to, data: report.customers })
      def shifts = render(json: { from: @from, to: @to, data: report.shifts })

      # One payload for the printed daily or monthly report.
      def grand
        r = report
        render json: { from: @from, to: @to, overview: r.overview, by_day: r.by_day, items: r.items(limit: 20), categories: r.categories, cashiers: r.cashiers, voids: r.voids.except(:rows), discounts: r.discounts.except(:rows), shifts: r.shifts }
      end

      private

      def set_range
        today = current_branch.business_day_for(Time.current)
        @from = params[:from].present? ? Date.parse(params[:from]) : today
        @to = params[:to].present? ? Date.parse(params[:to]) : @from
        raise Api::Errors::BadRequest.new("report.range", "Range cannot exceed 366 days") if (@to - @from).to_i > 366
        raise Api::Errors::Forbidden.new("permission.denied", "Only your own shift is visible") if !current_membership.can?("reports.view_all") && !current_membership.can?("reports.view_branch") && action_name != "shifts"
      rescue Date::Error
        raise Api::Errors::BadRequest.new("report.range", "Dates must be YYYY-MM-DD")
      end

      def report = Reports::Sales.new(branch: current_branch, from: @from, to: @to)
    end
  end
end

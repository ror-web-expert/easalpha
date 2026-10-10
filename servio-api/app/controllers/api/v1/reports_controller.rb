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

      # GET /reports/dashboard/spec?period=today|yesterday|7d|30d|month|custom&from&to  SPEC KPI cards, charts and pills
      def dashboard_spec
        require_permission!("reports.view_all", "reports.view_branch", "DASHBOARD", "VIEW_DAILY_SALES")
        render json: Reports::Dashboard.spec(current_branch, period: params[:period].presence || "today", from: params[:from], to: params[:to])
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
      # SPEC Cashier Till and Delivery Riders reports
      def cashier_till = render(json: Reports::CashierTill.run(branch: current_branch, from: @from, to: @to))
      # SPEC report catalogue (Phase 7)
      def grand_spec = render(json: Reports::Catalogue.grand(branch: current_branch, from: @from, to: @to))
      def sales = render(json: Reports::Catalogue.sales_detail(branch: current_branch, from: @from, to: @to, cursor: params[:cursor], limit: params[:limit], order_type: params[:order_type], source: params[:source]).merge(from: @from, to: @to))
      def sales_calendar = render(json: Reports::Catalogue.calendar(branch: current_branch, month: params[:month].present? ? Date.parse("#{params[:month]}-01") : today.beginning_of_month))
      def operations = render(json: Reports::Catalogue.operations(branch: current_branch, from: @from, to: @to))
      def vouchers = render(json: Marketing::Vouchers.report(branch: current_branch, from: @from, to: @to))
      def loyalty_points = render(json: Reports::Catalogue.loyalty_points(branch: current_branch, from: @from, to: @to))
      def regular_discounts = render(json: Marketing::RegularDiscounts.report(branch: current_branch, from: @from, to: @to))
      def ai_pricing
        i = Ai::Insights.latest("pricing", branch: current_branch)
        i = Ai::Insights.pricing!(branch: current_branch) if i.nil? || params[:refresh] == "true"
        render json: MarketingSerializers.insight(i)
      end
      def ai_stock_forecast
        i = Ai::Insights.latest("stock_forecast", branch: current_branch)
        i = Ai::Insights.stock_forecast!(branch: current_branch) if i.nil? || params[:refresh] == "true"
        render json: MarketingSerializers.insight(i)
      end
      def riders = render(json: Reports::Riders.run(branch: current_branch, from: @from, to: @to))

      # One payload for the printed daily or monthly report.
      def grand
        r = report
        render json: { from: @from, to: @to, spec: Reports::Catalogue.grand(branch: current_branch, from: @from, to: @to), overview: r.overview, by_day: r.by_day, items: r.items(limit: 20), categories: r.categories, cashiers: r.cashiers, voids: r.voids.except(:rows), discounts: r.discounts.except(:rows), shifts: r.shifts }
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

module Api
  module V1
    # Stock reports and the ledger. Settings live on /inventory_settings.
    class StockController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.view", "stock.actions", "stock.count", "reports.view_all") }

      def levels
        render json: Reports::Stock.levels(section_id: params[:section_id], q: params[:q], low_only: params[:low] == "true")
      end

      def valuation
        render json: { data: Reports::Stock.valuation }
      end

      def daily_sheet
        section = params[:section_id].present? ? StockSection.find(params[:section_id]) : StockSection.default_for(current_branch)
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current)
        render json: Reports::Stock.daily_sheet(section: section, day: day)
      end

      def waste
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current - 30
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        render json: Reports::Stock.waste(from: from, to: to, group_by: params[:group_by] == "item" ? "item" : "reason")
      end

      # GET /stock/consumption?from=&to=  ingredients used by sales (sale, packaging, net of returns) with value
      def consumption
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current - 30
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        rows = StockLedgerEntry.where(branch_id: current_branch.id, kind: %w[sale sale_return packaging], business_day: from..to).group(:stock_item_id).pluck(:stock_item_id, Arel.sql("SUM(quantity)"), Arel.sql("SUM(value_minor)"))
        items = StockItem.where(id: rows.map(&:first)).includes(:base_unit).index_by(&:id)
        data = rows.filter_map { |id, q, v| items[id] && { item: StockSerializers.item(items[id]), quantity: (-q).to_s, value_minor: -v.to_i } }.sort_by { |r| r[:value_minor] }.reverse
        render json: { from: from, to: to, rows: data, total_value_minor: data.sum { |r| r[:value_minor] } }
      end

      # GET /stock/deduction_audits?status=&business_day=
      def deduction_audits
        scope = DeductionAudit.includes(:order).joins(:order).where(orders: { branch_id: current_branch.id }).order(checked_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(orders: { business_day: Date.parse(params[:business_day]) }) if params[:business_day].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |a| RecipeSerializers.audit(a) }
      end

      # GET /stock/ledger?kind=&section_id=&item_id=&from=&to=&ref_id=
      def ledger
        scope = StockLedgerEntry.includes(:stock_section, stock_item: :base_unit).order(occurred_at: :desc, created_at: :desc)
        scope = scope.where(branch_id: current_branch.id) unless params[:all_branches] == "true"
        { kind: :kind, section_id: :stock_section_id, item_id: :stock_item_id, ref_id: :ref_id }.each { |p, col| scope = scope.where(col => params[p]) if params[p].present? }
        scope = scope.where(business_day: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(business_day: ..Date.parse(params[:to])) if params[:to].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |e| StockSerializers.ledger_entry(e) }
      end
    end
  end
end

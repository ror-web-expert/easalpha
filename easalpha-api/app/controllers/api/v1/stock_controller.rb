module Api
  module V1
    # Stock reports and the ledger. Settings live on /inventory_settings.
    class StockController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("stock.view", "stock.actions", "stock.count", "reports.view_all") }
      before_action :read_only_guard!, only: %i[reset rebuild_balances retry_deduction safety_net_run]

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
        from = params[:from].present? ? Date.parse(params[:from]) : today - 30
        to = params[:to].present? ? Date.parse(params[:to]) : today
        render json: Reports::Stock.waste(from: from, to: to, group_by: params[:group_by] == "item" ? "item" : "reason")
      end

      # GET /stock/consumption?from=&to=  ingredients used by sales (sale, packaging, net of returns) with value
      def consumption
        from = params[:from].present? ? Date.parse(params[:from]) : today - 30
        to = params[:to].present? ? Date.parse(params[:to]) : today
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

      # GET /stock/demand?section_id=&category=&bucket=low|critical|out|all_needing|everything  SPEC Demand
      def demand
        render json: Stock::Demand.build(branch: current_branch, section_id: params[:section_id].presence, category: params[:category].presence, bucket: params[:bucket].presence || "all_needing")
      end

      # POST /stock/reset  section_id?, approver_pin  SPEC Reset Stock
      def reset
        require_permission!("settings.manage")
        approver = require_approval!("settings.manage", pin: params[:approver_pin])
        section = params[:section_id].present? ? StockSection.active.find(params[:section_id]) : nil
        docs = Stock::Reset.call!(branch: current_branch, actor: current_membership, section: section, reason: params[:reason].presence || "Stock reset")
        audit!("bulk_delete", table_name: "stock_levels", approved_by: approver&.user, after: { documents: docs.map(&:label) })
        render json: { documents: docs.map { |d| StockSerializers.document(d) } }
      end

      # GET /stock/actual_vs_theoretical?from&to&section_id  SPEC: counted stock against what recipes say should remain
      def actual_vs_theoretical
        from = params[:from].present? ? Date.parse(params[:from]) : today - 30
        to = params[:to].present? ? Date.parse(params[:to]) : today
        render json: Reports::Stock.actual_vs_theoretical(branch: current_branch, from: from, to: to, section_id: params[:section_id].presence)
      end

      # GET /stock/valuation_cogs?from&to  SPEC Valuation & COGS
      def valuation_cogs
        from = params[:from].present? ? Date.parse(params[:from]) : today.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : today
        render json: Reports::Stock.valuation_cogs(branch: current_branch, from: from, to: to)
      end

      # GET /stock/deduction_health  SPEC: safety-net status, problem buckets, and the orders behind them
      def deduction_health
        latest = DeductionAudit.joins(:order).where(orders: { branch_id: current_branch.id }).select("DISTINCT ON (deduction_audits.order_id) deduction_audits.*").order("deduction_audits.order_id, deduction_audits.checked_at DESC")
        by_status = DeductionAudit.unscoped.from(latest, :deduction_audits).group("deduction_audits.status").count
        never = Stock::SafetyNet.candidates.where(branch_id: current_branch.id).where.not(id: DeductionAudit.select(:order_id))
        problems = Stock::SafetyNet.candidates.where(branch_id: current_branch.id).order(business_day: :desc).limit(50)
        render json: {
          safety_net: Stock::SafetyNet.status,
          buckets: by_status.merge("never_ran" => never.count, "pending" => Stock::SafetyNet.candidates.where(branch_id: current_branch.id).count),
          problem_orders: problems.map { |o| OrderSerializers.summary(o) }
        }
      end

      # GET /stock/deduction_health/:order_id  one order: its audits and every stock movement written for it
      def deduction_health_order
        order = Order.find(params[:order_id])
        entries = StockLedgerEntry.where(ref_table: "orders", ref_id: order.id).includes(:stock_section, stock_item: :base_unit).order(:occurred_at)
        render json: { order: OrderSerializers.summary(order), stock_deducted_at: order.stock_deducted_at,
                       audits: DeductionAudit.where(order_id: order.id).order(checked_at: :desc).map { |a| RecipeSerializers.audit(a) },
                       movements: entries.map { |e| StockSerializers.ledger_entry(e) } }
      end

      # POST /stock/deduction_health/:order_id/retry  SPEC Retry: run the deduction again; the unique index keeps it single
      def retry_deduction
        require_permission!("stock.actions", "settings.manage")
        order = Order.find(params[:order_id])
        raise Api::Errors::Conflict.new("order.not_completed", "Only a completed order deducts stock") unless order.completed?
        audit = Stock::Deduction.deduct!(order, actor: current_membership)
        audit!("update", record: order, after: { retry_deduction: audit.status })
        deduction_health_order
      end

      # POST /stock/safety_net/run  SPEC: run the safety net on demand
      def safety_net_run
        require_permission!("stock.actions", "settings.manage")
        run = Stock::SafetyNet.sweep!(trigger: "manual", by: current_membership)
        render json: { ran_at: run.ran_at, checked: run.checked, deducted: run.deducted, errors: run.errors_count, detail: run.detail, status: Stock::SafetyNet.status }
      end

      # POST /stock/rebuild_balances  SPEC: caches are derived; rebuild stock levels, accounts, customers and suppliers
      def rebuild_balances
        require_permission!("settings.manage", "stock.actions")
        result = Balances::Rebuild.all!
        audit!("bulk_update", table_name: "stock_levels", after: result)
        render json: result
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

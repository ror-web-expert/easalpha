module Api
  module V1
    # Purchasing summary, supplier aging, reorder suggestions, usage forecast and price history.
    class PurchasingController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("purchasing.manage", "suppliers.manage", "stock.view", "finance.view", "reports.view_all") }

      def summary = render(json: Suppliers::Ledger.summary)
      def aging = render(json: Suppliers::Ledger.aging_report(as_of: params[:as_of].present? ? Date.parse(params[:as_of]) : Date.current))
      def suggestions = render(json: { data: Purchasing::Demand.suggestions(branch: current_branch) })

      def forecast
        render json: Purchasing::Demand.forecast(branch: current_branch, lookback_days: (params[:lookback_days].presence || 30).to_i.clamp(7, 365), forecast_days: (params[:forecast_days].presence || 7).to_i.clamp(1, 90),
                                                 safety_percent: (params[:safety_percent].presence || 10).to_d, budget_minor: params[:budget_minor].presence&.to_i, category: params[:category])
      end

      # GET /purchasing/prices?stock_item_id=&supplier_id=
      def prices
        scope = SupplierPriceHistory.includes(:supplier, :unit).order(observed_on: :desc, created_at: :desc)
        scope = scope.where(stock_item_id: params[:stock_item_id]) if params[:stock_item_id].present?
        scope = scope.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |h| SupplierSerializers.price(h) }
      end

      # GET /purchasing/report?from=&to=&group_by=supplier|item
      def report
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current - 30
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        receipts = GoodsReceipt.where(branch_id: current_branch.id, status: "posted", received_on: from..to).includes(:supplier)
        rows = if params[:group_by] == "item"
          GoodsReceiptLine.where(goods_receipt_id: receipts.select(:id)).includes(:stock_item, :unit).group_by(&:stock_item_id).map do |_, ls|
            { key: ls.first.stock_item.name, item: StockSerializers.item(ls.first.stock_item), receipts: ls.size, quantity: ls.sum(&:base_quantity).to_s, value_minor: ls.sum(&:line_total_minor) }
          end
        else
          receipts.group_by(&:supplier_id).map { |_, gs| { key: gs.first.supplier.name, supplier: SupplierSerializers.supplier(gs.first.supplier), receipts: gs.size, value_minor: gs.sum(&:total_minor) } }
        end.sort_by { |r| -r[:value_minor] }
        render json: { from: from, to: to, rows: rows, total_minor: receipts.sum(:total_minor), returns_minor: PurchaseReturn.where(branch_id: current_branch.id, status: "posted", returned_on: from..to).sum(:amount_minor) }
      end
    end
  end
end

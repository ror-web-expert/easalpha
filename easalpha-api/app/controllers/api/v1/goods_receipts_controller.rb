module Api
  module V1
    class GoodsReceiptsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("purchasing.manage", "stock.view", "stock.actions") }, only: %i[index show]
      before_action -> { require_permission!("purchasing.manage", "stock.actions") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        scope = GoodsReceipt.includes(:supplier, :lines).where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(received_on: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(received_on: ..Date.parse(params[:to])) if params[:to].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |g| SupplierSerializers.goods_receipt(g) }
      end

      def show = render(json: SupplierSerializers.goods_receipt(GoodsReceipt.includes(:supplier, lines: %i[stock_item unit]).find(params[:id]), full: true))

      # POST /goods_receipts { supplier_id, purchase_order_id?, section_id?, invoice_ref, received_on, note, lines: [{stock_item_id, unit_id, quantity, unit_cost_minor, batch_no, expires_on}] }
      def create
        section = params[:section_id].present? ? StockSection.active.find(params[:section_id]) : StockSection.default_for(current_branch)
        grn = Purchasing::Receipts.create!(params.permit(:supplier_id, :purchase_order_id, :invoice_ref, :invoice_key, :received_on, :note).to_h.symbolize_keys, lines: lines_param, actor: current_membership, branch: current_branch, section: section)
        render json: SupplierSerializers.goods_receipt(grn.reload, full: true), status: :created
      end

      def cancel
        grn = GoodsReceipt.find(params[:id])
        approver = require_approval!("purchasing.manage")
        Purchasing::Receipts.cancel!(grn, actor: current_membership, reason: params[:reason])
        audit!("goods_receipt_cancel", record: grn, approved_by: approver&.user)
        render json: SupplierSerializers.goods_receipt(grn.reload, full: true)
      end

      private

      def lines_param
        Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
      end
    end
  end
end

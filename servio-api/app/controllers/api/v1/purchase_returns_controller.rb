module Api
  module V1
    class PurchaseReturnsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("purchasing.manage", "stock.view") }, only: %i[index show]
      before_action -> { require_permission!("purchasing.manage") }, only: :create
      before_action :read_only_guard!, only: :create

      def index
        scope = PurchaseReturn.includes(:supplier).where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |r| SupplierSerializers.purchase_return(r) }
      end

      def show = render(json: SupplierSerializers.purchase_return(PurchaseReturn.includes(:supplier, lines: %i[stock_item unit]).find(params[:id]), full: true))

      # POST /purchase_returns { supplier_id, goods_receipt_id?, section_id?, reason, settlement (credit_note|cash_refund), method_code?, lines: [{stock_item_id, unit_id, quantity, unit_cost_minor}] }
      def create
        section = params[:section_id].present? ? StockSection.active.find(params[:section_id]) : StockSection.default_for(current_branch)
        ret = Purchasing::Returns.create!(params.permit(:supplier_id, :goods_receipt_id, :reason, :settlement, :method_code).to_h.symbolize_keys, lines: lines_param, actor: current_membership, branch: current_branch, section: section, shift: current_shift)
        render json: SupplierSerializers.purchase_return(ret.reload, full: true), status: :created
      end

      private

      def lines_param
        Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
      end
    end
  end
end

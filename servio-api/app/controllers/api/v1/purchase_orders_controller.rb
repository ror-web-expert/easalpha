module Api
  module V1
    class PurchaseOrdersController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("purchasing.manage", "stock.view") }, only: %i[index show]
      before_action -> { require_permission!("purchasing.manage") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      def index
        scope = PurchaseOrder.includes(:supplier, :lines).where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(status: %w[sent partial]) if params[:open] == "true"
        scope = scope.where(supplier_id: params[:supplier_id]) if params[:supplier_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |po| SupplierSerializers.purchase_order(po) }
      end

      def show
        render json: SupplierSerializers.purchase_order(PurchaseOrder.includes(:supplier, lines: %i[stock_item unit], goods_receipts: %i[supplier lines]).find(params[:id]), full: true)
      end

      # POST /purchase_orders { supplier_id, expected_on, note, lines: [{stock_item_id, unit_id, quantity, unit_cost_minor}], send: true }
      def create
        po = Purchasing::Orders.create!(po_params, lines: lines_param, actor: current_membership, branch: current_branch)
        Purchasing::Orders.send!(po) if ActiveModel::Type::Boolean.new.cast(params[:send])
        audit!("create", record: po, after: { number: po.number, total_minor: po.total_minor })
        render json: SupplierSerializers.purchase_order(po.reload, full: true), status: :created
      end

      def update
        po = PurchaseOrder.find(params[:id])
        raise Api::Errors::Conflict.new("purchase_order.status", "Only a draft can be edited") unless po.draft?
        po.update!(po_params.except(:supplier_id))
        Purchasing::Orders.replace_lines!(po, lines_param) if params.key?(:lines)
        render json: SupplierSerializers.purchase_order(po.reload, full: true)
      end

      def send_order
        po = PurchaseOrder.find(params[:id])
        Purchasing::Orders.send!(po)
        render json: SupplierSerializers.purchase_order(po.reload, full: true)
      end

      def cancel
        po = PurchaseOrder.find(params[:id])
        Purchasing::Orders.cancel!(po, reason: params[:reason])
        render json: SupplierSerializers.purchase_order(po.reload, full: true)
      end

      # POST /purchase_orders/:id/receive { section_id?, invoice_ref?, received_on?, lines?: [{purchase_order_line_id, quantity, unit_cost_minor, batch_no, expires_on}] }
      def receive
        po = PurchaseOrder.includes(lines: %i[stock_item unit]).find(params[:id])
        section = params[:section_id].present? ? StockSection.active.find(params[:section_id]) : StockSection.default_for(current_branch)
        grn = Purchasing::Orders.receive!(po, actor: current_membership, branch: current_branch, section: section, lines: params[:lines].present? ? lines_param : nil, invoice_ref: params[:invoice_ref],
                                          received_on: params[:received_on].present? ? Date.parse(params[:received_on]) : Date.current, note: params[:note])
        render json: { receipt: SupplierSerializers.goods_receipt(grn, full: true), purchase_order: SupplierSerializers.purchase_order(po.reload, full: true) }, status: :created
      end

      def destroy
        po = PurchaseOrder.find(params[:id])
        raise Api::Errors::Conflict.new("purchase_order.status", "Only a draft can be deleted") unless po.draft?
        po.destroy!
        head :no_content
      end

      private

      def po_params = params.permit(:supplier_id, :expected_on, :note).to_h.symbolize_keys

      def lines_param
        Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
      end
    end
  end
end

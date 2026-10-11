module Api
  module V1
    # Numbered stock documents: receive, transfer, waste, adjustment, count, production, supplier return. Draft, then post, or cancel.
    class StockDocumentsController < BaseController
      before_action :authenticate!
      before_action :read_only_guard!, except: %i[index show]
      before_action :permission_for_kind!, except: %i[index show]

      # GET /stock_documents?kind=&status=&from=&to=&section_id=
      def index
        require_permission!("stock.view", "stock.actions", "stock.waste", "stock.count")
        scope = StockDocument.includes(:lines).where(branch_id: current_branch.id).order(created_at: :desc)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        scope = scope.where(status: params[:status]) if params[:status].present?
        scope = scope.where(business_day: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(business_day: ..Date.parse(params[:to])) if params[:to].present?
        scope = scope.where("from_section_id = :s OR to_section_id = :s", s: params[:section_id]) if params[:section_id].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |d| StockSerializers.document(d) }
      end

      def show
        d = StockDocument.includes(lines: %i[stock_item unit]).find(params[:id])
        render json: StockSerializers.document(d, full: true)
      end

      # POST /stock_documents { kind, from_section_id, to_section_id, reason, invoice_ref, note, client_id, lines: [{stock_item_id, unit_id, quantity, unit_cost_minor, batch_no, expires_on, counted_qty}], post: true }
      def create
        doc = Stock::Posting.create!(doc_params, lines: lines_param, actor: current_membership, branch: current_branch)
        Stock::Posting.post!(doc, actor: current_membership, posting_date: params[:posting_date].presence) if ActiveModel::Type::Boolean.new.cast(params[:post]) && doc.draft?
        Stock::Posting.submit!(doc, actor: current_membership) if ActiveModel::Type::Boolean.new.cast(params[:submit]) && doc.draft?
        render json: StockSerializers.document(doc.reload, full: true), status: :created
      end

      def update
        doc = StockDocument.find(params[:id])
        raise Api::Errors::Conflict.new("stock.document_posted", "Only a draft can be edited") unless doc.draft?
        doc.update!(doc_params.except(:kind, :client_id))
        Stock::Posting.replace_lines!(doc, lines_param) if params.key?(:lines)
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def post
        doc = StockDocument.includes(lines: %i[stock_item unit]).find(params[:id])
        Stock::Posting.post!(doc, actor: current_membership, posting_date: params[:posting_date].presence)
        render json: StockSerializers.document(doc.reload, full: true)
      end

      # SPEC statuses: submit (Awaiting approval), approve, dispatch (In transit) and receive a transfer
      def submit
        doc = StockDocument.find(params[:id])
        Stock::Posting.submit!(doc, actor: current_membership)
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def approve
        require_permission!("stock.actions")
        doc = StockDocument.includes(lines: %i[stock_item unit]).find(params[:id])
        Stock::Posting.approve!(doc, actor: current_membership, posting_date: params[:posting_date].presence)
        audit!("approve", record: doc, after: { status: doc.status })
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def dispatch_transfer # `dispatch` is reserved by ActionController
        doc = StockDocument.includes(lines: %i[stock_item unit]).find(params[:id])
        Stock::Posting.dispatch!(doc, actor: current_membership, posting_date: params[:posting_date].presence)
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def receive
        doc = StockDocument.includes(lines: %i[stock_item unit]).find(params[:id])
        raise Api::Errors::Conflict.new("stock.document_status", "Document is #{doc.status}") unless doc.in_transit?
        Stock::Posting.post!(doc, actor: current_membership, posting_date: params[:posting_date].presence)
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def cancel
        doc = StockDocument.find(params[:id])
        approver = doc.posted? ? require_approval!("stock.actions") : current_membership
        Stock::Posting.cancel!(doc, actor: current_membership, reason: params[:reason])
        audit!("stock_cancel", record: doc, approved_by: approver&.user) if doc.posted? || true
        render json: StockSerializers.document(doc.reload, full: true)
      end

      def destroy
        doc = StockDocument.find(params[:id])
        raise Api::Errors::Conflict.new("stock.document_posted", "Posted documents are cancelled, not deleted") unless doc.draft?
        doc.destroy!
        head :no_content
      end

      private

      def kind_param = (params[:kind].presence || StockDocument.find_by(id: params[:id])&.kind).to_s

      def permission_for_kind!
        case kind_param
        when "waste" then require_permission!("stock.actions", "stock.waste")
        when "count" then require_permission!("stock.actions", "stock.count") unless InventorySetting.current.counting_open && current_membership.can?("app.pos")
        else
          # Anyone who may view stock can draft and submit for approval; posting needs stock.actions.
          action_name.in?(%w[create update submit destroy]) ? require_permission!("stock.actions", "stock.view", "PURCHASE_ORDERS") : require_permission!("stock.actions")
        end
      end

      def doc_params
        params.permit(:kind, :from_section_id, :to_section_id, :supplier_id, :reason, :invoice_ref, :note, :client_id, :posting_date, :purchase_order_id).to_h.symbolize_keys
      end

      def lines_param
        Array(params[:lines]).map { |l| l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys }
      end
    end
  end
end

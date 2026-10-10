module Api
  module V1
    class ExpensesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("expenses.manage", "finance.view", "reports.view_all") }, only: %i[index show summary categories]
      before_action -> { require_permission!("expenses.manage") }, except: %i[index show summary categories]
      before_action :read_only_guard!, except: %i[index show summary categories]

      # GET /expenses?from=&to=&category_id=&source=&q=
      def index
        scope = Expense.includes(:category, :payment_method).where(branch_id: current_branch.id).order(spent_on: :desc, created_at: :desc)
        scope = scope.where(spent_on: range)
        scope = scope.where(category_id: ExpenseCategory.where(id: params[:category_id]).or(ExpenseCategory.where(parent_id: params[:category_id])).select(:id)) if params[:category_id].present?
        scope = scope.where(source: params[:source]) if params[:source].present?
        scope = scope.live unless params[:include_voided] == "true"
        scope = scope.where("note ILIKE :q OR paid_to ILIKE :q", q: "%#{params[:q]}%") if params[:q].present?
        rows, cursor = paginate(scope)
        render_page(rows, cursor) { |e| DeliverySerializers.expense(e) }
      end

      def show = render(json: DeliverySerializers.expense(Expense.includes(:category, :payment_method).find(params[:id])))

      # POST /expenses { category_id, amount_minor, method_code, spent_on, paid_to, note, receipt_key, client_id, approver_pin? }
      def create
        e = Expenses::Recorder.create!(params.permit(:category_id, :amount_minor, :method_code, :spent_on, :paid_to, :note, :receipt_key, :client_id).to_h.symbolize_keys, actor: current_membership, branch: current_branch,
                                       shift: current_shift, source: current_device ? "till" : "admin")
        render json: DeliverySerializers.expense(e), status: :created
      end

      def update
        e = Expense.live.find(params[:id])
        e.update!(params.permit(:paid_to, :note, :receipt_key, :spent_on))
        render json: DeliverySerializers.expense(e)
      end

      def void
        e = Expense.find(params[:id])
        approver = require_approval!("expenses.manage")
        Expenses::Recorder.void!(e, actor: current_membership, reason: params.require(:reason))
        audit!("void", record: e, approved_by: approver&.user)
        render json: DeliverySerializers.expense(e.reload)
      end

      def summary = render(json: Reports::Expenses.summary(branch: current_branch, from: range.first, to: range.last))

      # GET /expenses/categories  tree, seeded on first use
      def categories
        ExpenseCategory.seed_defaults! unless ExpenseCategory.exists?
        roots = ExpenseCategory.active.where(parent_id: nil).order(:sort_order, :name).includes(:children)
        render json: { data: roots.map { |c| DeliverySerializers.expense_category(c, children: c.children.select { |x| x.archived_at.nil? }.sort_by { |x| [x.sort_order, x.name] }) } }
      end

      def create_category
        c = ExpenseCategory.create!(params.permit(:name, :parent_id, :sort_order))
        render json: DeliverySerializers.expense_category(c), status: :created
      end

      def update_category
        c = ExpenseCategory.active.find(params[:id])
        c.update!(params.permit(:name, :parent_id, :sort_order))
        render json: DeliverySerializers.expense_category(c)
      end

      def destroy_category
        c = ExpenseCategory.active.find(params[:id])
        raise Api::Errors::Conflict.new("expense_category.in_use", "Move its expenses first") if Expense.where(category_id: [c.id] + c.children.pluck(:id)).exists?
        ExpenseCategory.where(id: [c.id] + c.children.pluck(:id)).update_all(archived_at: Time.current)
        head :no_content
      end

      private

      def range
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        from..to
      end
    end
  end
end

module Api
  module V1
    class PaymentAccountsController < BaseController
      before_action -> { require_permission!("finance.view", "settings.manage", "shifts.any") }, only: %i[index show entries]
      before_action -> { require_permission!("settings.manage", "shifts.any") }, except: %i[index show entries]
      before_action :read_only_guard!, except: %i[index show entries]

      def index
        render json: { data: PaymentAccount.where(archived_at: nil).order(:kind, :name).map { |a| PaymentSerializers.account(a) },
                       total_balance_minor: PaymentAccount.active.company.sum(:current_balance_minor) }
      end

      def show
        render json: PaymentSerializers.account(PaymentAccount.find(params[:id]))
      end

      def entries
        account = PaymentAccount.find(params[:id])
        scope = account.entries.order(occurred_at: :desc)
        scope = scope.where(business_day: params[:business_day]) if params[:business_day].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :occurred_at)
        render_page(rows, cursor) { |e| PaymentSerializers.entry(e) }
      end

      def create
        a = PaymentAccount.create!(params.permit(:name, :kind, :bank_name, :account_no, :branch_id, :opening_balance_minor))
        a.post!(kind: "opening", amount_minor: a.opening_balance_minor, business_day: current_branch.business_day_for(Time.current), description: "Opening balance", by: current_membership) if a.opening_balance_minor.positive?
        render json: PaymentSerializers.account(a.reload), status: :created
      end

      def update
        a = PaymentAccount.find(params[:id])
        if params.key?(:active) && !ActiveModel::Type::Boolean.new.cast(params[:active])
          a.deactivate!
        else
          a.update!(params.permit(:name, :bank_name, :account_no, :active))
        end
        render json: PaymentSerializers.account(a)
      end

      # POST /payment_accounts/:id/transfer  to_account_id, amount_minor, note
      def transfer
        from = PaymentAccount.active.find(params[:id])
        to = PaymentAccount.active.find(params.require(:to_account_id))
        amount = params.require(:amount_minor).to_i
        raise Api::Errors::BadRequest.new("transfer.amount", "Amount must be positive") unless amount.positive?
        day = current_branch.business_day_for(Time.current)
        PaymentAccount.transaction do
          from.post!(kind: "transfer_out", amount_minor: -amount, business_day: day, description: "Transfer to #{to.name}: #{params[:note]}", by: current_membership)
          to.post!(kind: "transfer_in", amount_minor: amount, business_day: day, description: "Transfer from #{from.name}: #{params[:note]}", by: current_membership)
          Finance::Journal.transfer!(from: from, to: to, amount_minor: amount, business_day: day, actor: current_membership, note: params[:note])
        end
        audit!("create", record: from, after: { transfer_to: to.name, amount_minor: amount })
        render json: { from: PaymentSerializers.account(from.reload), to: PaymentSerializers.account(to.reload) }
      end

      # POST /payment_accounts/:id/adjust  kind (deposit|withdrawal|adjustment), amount_minor (signed for adjustment), note
      def adjust
        a = PaymentAccount.active.find(params[:id])
        kind = params.require(:kind).to_s
        raise Api::Errors::BadRequest.new("adjust.kind", "kind must be deposit, withdrawal or adjustment") unless kind.in?(%w[deposit withdrawal adjustment])
        amount = params.require(:amount_minor).to_i
        amount = -amount.abs if kind == "withdrawal"
        amount = amount.abs if kind == "deposit"
        raise Api::Errors::BadRequest.new("adjust.note", "A note is required") if params[:note].blank?
        a.post!(kind: kind, amount_minor: amount, business_day: current_branch.business_day_for(Time.current), description: params[:note], by: current_membership)
        audit!("create", record: a, after: { kind: kind, amount_minor: amount, note: params[:note] })
        render json: PaymentSerializers.account(a.reload)
      end
    end
  end
end

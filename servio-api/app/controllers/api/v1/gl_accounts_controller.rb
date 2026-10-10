module Api
  module V1
    # SPEC Chart of Accounts: seeded system rows that users may extend but not break.
    class GlAccountsController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("finance.view", "settings.manage") }, only: %i[index show ledger]
      before_action -> { require_permission!("settings.manage") }, except: %i[index show ledger]
      before_action :read_only_guard!, except: %i[index show ledger]

      # GET /finance/accounts?kind=&as_of=   every account with its balance as of the day
      def index
        Finance::Chart.seed! unless GlAccount.exists?
        as_of = params[:as_of].present? ? Date.parse(params[:as_of]) : today
        balances = Finance::Statements.balances(as_of: as_of)
        scope = GlAccount.active.order(:code)
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        all = scope.to_a
        children = all.group_by(&:parent_id)
        rollup = lambda { |a| (balances[a.id] || 0) + (children[a.id] || []).sum { |c| rollup.call(c) } }
        # Each row carries its own balance and the total of everything beneath it (payment accounts post to children).
        rows = all.map { |a| FinanceSerializers.gl_account(a, balance: balances[a.id] || 0).merge(rollup_minor: rollup.call(a)) }
        render json: { as_of: as_of, data: rows }
      end

      def show
        a = GlAccount.find(params[:id])
        render json: FinanceSerializers.gl_account(a, balance: Finance::Statements.balances(as_of: today)[a.id] || 0)
      end

      # GET /finance/accounts/:id/ledger?from=&to=   one account's lines with a running balance (Combined Ledger drill-down)
      def ledger
        a = GlAccount.find(params[:id])
        from = params[:from].present? ? Date.parse(params[:from]) : today.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : today
        render json: Finance::Statements.account_ledger(a, from: from, to: to)
      end

      def create
        a = GlAccount.create!(params.permit(:code, :name, :kind, :normal_side, :parent_id, :opening_balance_minor, :description).to_h.merge(is_system: false))
        audit!("create", record: a, after: { code: a.code, name: a.name })
        render json: FinanceSerializers.gl_account(a), status: :created
      end

      def update
        a = GlAccount.find(params[:id])
        allowed = a.is_system ? %i[name description opening_balance_minor] : %i[code name kind normal_side parent_id opening_balance_minor description]
        a.update!(params.permit(*allowed))
        render json: FinanceSerializers.gl_account(a)
      end

      def destroy
        a = GlAccount.find(params[:id])
        raise Api::Errors::Conflict.new("gl_account.system", "#{a.code} #{a.name} is a system account") if a.is_system
        raise Api::Errors::Conflict.new("gl_account.in_use", "#{a.code} has journal lines; archive is not allowed") if a.journal_lines.exists?
        a.update!(archived_at: Time.current)
        head :no_content
      end

      def seed
        Finance::Chart.seed!
        render json: { seeded: GlAccount.count }
      end
    end
  end
end

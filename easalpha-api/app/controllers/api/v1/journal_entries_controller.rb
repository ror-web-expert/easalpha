module Api
  module V1
    # SPEC Journal Voucher and the Combined Ledger of every posting.
    class JournalEntriesController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("finance.view", "settings.manage") }, only: %i[index show]
      before_action -> { require_permission!("settings.manage") }, except: %i[index show]
      before_action :read_only_guard!, except: %i[index show]

      # GET /finance/journal?from=&to=&kind=&account_id=&q=
      def index
        scope = JournalEntry.includes(lines: :gl_account).order(business_day: :desc, number: :desc)
        scope = scope.where(business_day: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(business_day: ..Date.parse(params[:to])) if params[:to].present?
        scope = scope.where(kind: params[:kind]) if params[:kind].present?
        scope = scope.where(id: JournalLine.where(gl_account_id: params[:account_id]).select(:journal_entry_id)) if params[:account_id].present?
        scope = scope.where("description ILIKE ?", "%#{params[:q]}%") if params[:q].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :posted_at)
        render_page(rows, cursor) { |e| FinanceSerializers.journal_entry(e, full: true) }
      end

      def show = render(json: FinanceSerializers.journal_entry(JournalEntry.includes(lines: :gl_account).find(params[:id]), full: true))

      # POST /finance/journal { business_day, description, lines: [{ gl_account_id | code, debit_minor, credit_minor, description }] }
      def create
        lines = Array(params[:lines]).map do |l|
          h = l.respond_to?(:to_unsafe_h) ? l.to_unsafe_h.symbolize_keys : l.to_h.symbolize_keys
          { account: h[:gl_account_id].present? ? GlAccount.active.find(h[:gl_account_id]) : h[:code], debit_minor: h[:debit_minor], credit_minor: h[:credit_minor], description: h[:description] }
        end
        day = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current)
        e = Finance::Journal.post!(business_day: day, description: params[:description], lines: lines, kind: "manual", actor: current_membership, branch_id: current_branch.id)
        render json: FinanceSerializers.journal_entry(e.reload, full: true), status: :created
      end

      def reverse
        e = JournalEntry.find(params[:id])
        r = Finance::Journal.reverse!(e, actor: current_membership, description: params[:reason].presence)
        audit!("cancel", record: e, after: { reversed_by: r.label, reason: params[:reason] })
        render json: FinanceSerializers.journal_entry(r.reload, full: true), status: :created
      end
    end
  end
end

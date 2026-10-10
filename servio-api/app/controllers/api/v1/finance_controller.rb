module Api
  module V1
    # Finance: combined ledger, reconciliation, integrity check, profit and loss, journal export, branch comparison, Foodpanda report and settings.
    class FinanceController < BaseController
      before_action :authenticate!
      before_action -> { require_permission!("finance.view", "reports.view_all") }, except: %i[update_foodpanda]

      # SPEC Finance Dashboard, Trial Balance, Balance Sheet, Liabilities, Equity
      def dashboard = render(json: Finance::Statements.dashboard(branch: current_branch, day: params[:business_day].present? ? Date.parse(params[:business_day]) : nil))
      def trial_balance = render(json: Finance::Statements.trial_balance(from: range.begin, to: range.end))
      def balance_sheet = render(json: Finance::Statements.balance_sheet(as_of: as_of))
      def liabilities = render(json: Finance::Statements.liabilities(as_of: as_of))
      def equity = render(json: Finance::Statements.equity(as_of: as_of))
      def as_of = params[:as_of].present? ? Date.parse(params[:as_of]) : Date.current

      def ledger = render(json: Finance::Ledger.day(branch: current_branch, day: day_param))
      def reconciliation = render(json: Finance::Ledger.reconciliation(branch: current_branch, day: day_param))
      def integrity = render(json: Finance::Ledger.integrity(branch: current_branch, from: range.first, to: range.last))
      def profit_loss = render(json: Finance::ProfitLoss.run(branch: current_branch, from: range.first, to: range.last))
      def branches = render(json: Reports::Branches.compare(from: range.first, to: range.last))
      def foodpanda_report = render(json: Aggregators::Foodpanda.report(branch: current_branch, from: range.first, to: range.last))

      # GET /finance/export?format=quickbooks|xero&from=&to=
      def export
        audit!("export", table_name: "account_entries", after: { from: range.first, to: range.last, format: params[:format] })
        send_data Finance::Export.journal_csv(branch: current_branch, from: range.first, to: range.last, format: params[:format] == "xero" ? "xero" : "quickbooks"),
                  filename: "servio-journal-#{params[:format] == 'xero' ? 'xero' : 'quickbooks'}-#{range.first}-#{range.last}.csv", type: "text/csv"
      end

      # GET /integrations/foodpanda   PATCH /integrations/foodpanda { enabled, secret, commission_percent, auto_accept, branch_id }
      def foodpanda
        require_permission!("settings.manage", "finance.view")
        s = Aggregators::Foodpanda.settings(current_business)
        render json: s.merge("secret" => s["secret"].present? ? "••••#{s['secret'].to_s[-4..]}" : nil, "webhook_url" => "/api/v1/webhooks/foodpanda/#{current_business.slug}",
                             "events" => AggregatorEvent.where(provider: "foodpanda").order(received_at: :desc).limit(20).map { |e| { id: e.id, external_id: e.external_id, event: e.event, status: e.status, order_id: e.order_id, error: e.error, received_at: e.received_at } })
      end

      def update_foodpanda
        require_permission!("settings.manage")
        read_only_guard!
        current = Aggregators::Foodpanda.settings(current_business)
        incoming = params.permit(:enabled, :secret, :commission_percent, :auto_accept, :branch_id).to_h
        incoming["secret"] = SecureRandom.hex(16) if incoming["secret"] == "rotate"
        merged = current.merge(incoming)
        current_business.update!(settings: current_business.settings.merge("foodpanda" => merged))
        audit!("settings_change", record: current_business, after: { foodpanda: merged.except("secret") })
        render json: merged.merge("secret_plain" => (incoming.key?("secret") ? merged["secret"] : nil), "secret" => merged["secret"].present? ? "••••#{merged['secret'].to_s[-4..]}" : nil)
      end

      private

      def day_param = params[:business_day].present? ? Date.parse(params[:business_day]) : current_branch.business_day_for(Time.current)

      def range
        from = params[:from].present? ? Date.parse(params[:from]) : Date.current.beginning_of_month
        to = params[:to].present? ? Date.parse(params[:to]) : Date.current
        from..to
      end
    end
  end
end

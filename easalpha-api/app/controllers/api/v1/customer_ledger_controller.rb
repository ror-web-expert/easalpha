module Api
  module V1
    class CustomerLedgerController < BaseController
      before_action -> { require_permission!("customers.view", "customers.manage", "khata.collect", "reports.view_all", "finance.view") }
      before_action -> { require_module!("customer_accounts") }

      # GET /customers/:id/ledger?from=&to=  every entry with the running balance; with a period, the balance brought
      # forward, the entries inside it, totals and the closing balance.
      def show
        customer = Customer.find(params[:id])
        base = { customer: CustomerSerializers.customer(customer), balance_minor: customer.balance_minor, aging: Customers::Ledger.aging(customer, as_of: today) }
        if params[:from].present? || params[:to].present?
          from = params[:from].present? ? Date.parse(params[:from]) : Date.new(2000, 1, 1)
          to = params[:to].present? ? Date.parse(params[:to]) : today
          st = Customers::Ledger.statement(customer, from: from, to: to)
          render json: base.merge(from: from, to: to, brought_forward_minor: st[:brought_forward_minor], closing_balance_minor: st[:closing_balance_minor], totals: st[:totals], entries: st[:entries])
        else
          entries = Customers::Ledger.entries(customer)
          render json: base.merge(brought_forward_minor: 0, closing_balance_minor: entries.last&.dig(:balance_minor) || 0, totals: Customers::Ledger.totals(entries), entries: entries)
        end
      rescue Date::Error
        raise Api::Errors::BadRequest.new("ledger.period", "Dates must be YYYY-MM-DD")
      end

      def aging
        as_of = params[:as_of].present? ? Date.parse(params[:as_of]) : today
        render json: Customers::Ledger.aging_report(as_of: as_of)
      end

      def summary
        render json: Customers::Ledger.summary
      end
    end
  end
end

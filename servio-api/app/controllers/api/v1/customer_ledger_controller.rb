module Api
  module V1
    class CustomerLedgerController < BaseController
      before_action -> { require_permission!("customers.view", "customers.manage", "khata.collect", "reports.view_all", "finance.view") }

      def show
        customer = Customer.find(params[:id])
        render json: { customer: CustomerSerializers.customer(customer), balance_minor: customer.balance_minor, aging: Customers::Ledger.aging(customer), entries: Customers::Ledger.entries(customer) }
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

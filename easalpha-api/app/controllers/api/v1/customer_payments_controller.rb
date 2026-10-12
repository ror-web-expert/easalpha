module Api
  module V1
    class CustomerPaymentsController < BaseController
      before_action -> { require_permission!("khata.collect", "customers.manage") }
      before_action -> { require_module!("customer_accounts") }
      before_action :read_only_guard!, except: %i[index]

      # GET /customers/:customer_id/payments
      # GET /customer_payments?from=&to=&method_code=&direction=&customer_id=  (SPEC Customer Payments screen)
      def all
        scope = CustomerPayment.includes(:payment_method, :customer).order(received_at: :desc)
        scope = scope.where(customer_id: params[:customer_id]) if params[:customer_id].present?
        scope = scope.where(direction: params[:direction]) if params[:direction].present?
        scope = scope.where(business_day: Date.parse(params[:from])..) if params[:from].present?
        scope = scope.where(business_day: ..Date.parse(params[:to])) if params[:to].present?
        scope = scope.where(payment_method_id: PaymentMethod.where(code: params[:method_code]).select(:id)) if params[:method_code].present?
        rows, cursor = Paginator.call(scope, cursor: params[:cursor], limit: params[:limit], order_column: :received_at)
        render json: { data: rows.map { |p| PaymentSerializers.customer_payment(p).merge(customer_name: p.customer.name, khata_no: p.customer.khata_no) }, next_cursor: cursor,
                       totals: { received_minor: scope.where(direction: "received").sum(:amount_minor), paid_minor: scope.where(direction: "paid").sum(:amount_minor), count: scope.count } }
      end

      def index
        customer = Customer.find(params[:id])
        rows, cursor = Paginator.call(CustomerPayment.where(customer_id: customer.id), cursor: params[:cursor], limit: params[:limit], order_column: :received_at)
        render_page(rows, cursor) { |p| PaymentSerializers.customer_payment(p) }
      end

      # POST /customers/:customer_id/payments  amount_minor, method_code, reference, direction (received|paid)
      def create
        customer = Customer.active.find(params[:id])
        cp = Payments::Khata.receive!(customer, amount_minor: params.require(:amount_minor).to_i, method_code: params.require(:method_code), reference: params[:reference],
                                      actor: current_membership, branch: current_branch, shift: current_shift, direction: params[:direction].presence_in(%w[received paid]) || "received")
        render json: { payment: PaymentSerializers.customer_payment(cp), customer: CustomerSerializers.customer(customer.reload) }, status: :created
      end
    end
  end
end

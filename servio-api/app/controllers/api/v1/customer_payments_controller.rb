module Api
  module V1
    class CustomerPaymentsController < BaseController
      before_action -> { require_permission!("khata.collect", "customers.manage") }
      before_action :read_only_guard!, except: %i[index]

      # GET /customers/:customer_id/payments
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

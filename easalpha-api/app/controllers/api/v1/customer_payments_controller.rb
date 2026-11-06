module Api
  module V1
    class CustomerPaymentsController < BaseController
      # Taking a payment (create) is checked inside, so a cashier without khata.collect can be approved by a manager's PIN.
      before_action -> { require_permission!("khata.collect", "customers.manage") }, except: %i[create]
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

      UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

      # POST /customers/:customer_id/payments  amount_minor, method_code, reference, direction (received|paid),
      # received_on? (YYYY-MM-DD, needs khata.adjust), payment_id? (the till's own UUID for this press: the same id again,
      # a double press or a retry after a timeout, answers with the payment already recorded, never a second one),
      # approver_pin? (a manager's PIN when the user lacks khata.collect).
      def create
        customer = Customer.active.find(params[:id])
        payment_id = params[:payment_id].to_s.presence
        raise Api::Errors::BadRequest.new("payment.id", "payment_id must be a UUID") if payment_id && !payment_id.match?(UUID)
        return render_existing(customer, payment_id) if payment_id && CustomerPayment.exists?(id: payment_id)
        approver = current_membership.can?("customers.manage") ? current_membership : require_approval!("khata.collect")
        cp = Payments::Khata.receive!(customer, id: payment_id, amount_minor: params.require(:amount_minor).to_i, method_code: params.require(:method_code), reference: params[:reference],
                                      actor: current_membership, branch: current_branch, shift: current_shift, direction: params[:direction].presence_in(%w[received paid]) || "received",
                                      received_on: params[:received_on].presence)
        AuditLog.record(action: "approve", record: cp, after: { permission: "khata.collect", approved_by: approver.id, for: current_membership.id }) unless approver == current_membership
        render json: { payment: PaymentSerializers.customer_payment(cp), customer: CustomerSerializers.customer(customer.reload) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        # Two presses at once: the second waited on the customer's row lock, then found the first payment's id taken.
        raise unless payment_id && CustomerPayment.exists?(id: payment_id)
        render_existing(customer, payment_id)
      end

      private

      def render_existing(customer, payment_id)
        cp = CustomerPayment.find(payment_id)
        raise Api::Errors::Conflict.new("payment.foreign_id", "That payment id belongs to another account") unless cp.customer_id == customer.id
        render json: { payment: PaymentSerializers.customer_payment(cp), customer: CustomerSerializers.customer(customer.reload) }, status: :ok
      end
    end
  end
end

module Api
  module V1
    # Customer accounts (khata) beyond sales and payments: opening balances, adjustments and their reversals, bills for a
    # period (JSON or PDF), sending a bill, printing every bill at once, and bill runs. Needs the customer accounts module.
    class CustomerAccountsController < BaseController
      VIEW = %w[customers.view customers.manage khata.collect CUSTOMER_ACCOUNT reports.view_all finance.view].freeze
      SEND = %w[SEND_ACCOUNT_BILL CUSTOMER_ACCOUNT customers.manage].freeze

      before_action -> { require_permission!(*VIEW) }
      before_action -> { require_module!("customer_accounts") }
      before_action :read_only_guard!, only: %i[create_adjustment reverse send_bill create_run]

      # GET /customers/:id/adjustments
      def adjustments
        customer = Customer.find(params[:id])
        rows = CustomerAdjustment.where(customer_id: customer.id).includes(:reverses, :reversal).order(created_at: :desc)
        render json: { data: rows.map { |a| serialize(a) }, open_opening: Customers::Accounts.open_opening(customer).first&.then { |a| serialize(a) } }
      end

      # POST /customers/:id/adjustments  { kind: opening|adjustment, amount_minor (signed), reason, effective_on?, approver_pin? }
      # Without khata.adjust, a manager's PIN approves it.
      def create_adjustment
        customer = Customer.active.find(params[:id])
        approver = require_approval!("khata.adjust")
        adj = Customers::Accounts.adjust!(customer, kind: params.require(:kind), amount_minor: params.require(:amount_minor), reason: params[:reason], effective_on: params[:effective_on],
                                                    actor: current_membership, approver: approver == current_membership ? nil : approver, branch: current_branch)
        render json: { adjustment: serialize(adj), customer: CustomerSerializers.customer(customer.reload) }, status: :created
      end

      # POST /customer_adjustments/:id/reverse  { reason, approver_pin? }
      def reverse
        adj = CustomerAdjustment.find(params[:id])
        approver = require_approval!("khata.adjust")
        rev = Customers::Accounts.reverse!(adj, reason: params[:reason], actor: current_membership, approver: approver == current_membership ? nil : approver, branch: current_branch)
        render json: { adjustment: serialize(rev), customer: CustomerSerializers.customer(adj.customer.reload) }, status: :created
      end

      # GET /customers/:id/bill?from=&to=&due_on=  defaults to last month
      def bill
        customer = Customer.find(params[:id])
        render json: build_bill(customer).merge(link: Customers::BillToken.url(customer, from: period[0], to: period[1], due_on: due_on))
      end

      # GET /customers/:id/bill.pdf?from=&to=&due_on=
      def bill_pdf
        customer = Customer.find(params[:id])
        b = build_bill(customer)
        send_data Customers::BillPdf.render([ b ]), filename: b[:filename], type: "application/pdf", disposition: params[:inline] == "true" ? "inline" : "attachment"
      end

      # POST /customers/:id/send_bill { from?, to?, due_on? }  WhatsApp to the customer (and guardian), with the PDF.
      def send_bill
        require_permission!(*SEND)
        customer = Customer.active.find(params[:id])
        Whatsapp::Account.guard!(current_business)
        Customers::Bills.require_connected!(current_business)
        b = build_bill(customer)
        msgs = Customers::Notify.bill!(customer, bill: b, link: Customers::BillToken.url(customer, from: period[0], to: period[1], due_on: due_on),
                                                 attach_pdf: ActiveModel::Type::Boolean.new.cast(current_business.setting("khata.monthly_bills.attach_pdf")) != false)
        audit!("create", table_name: "whatsapp_messages", after: { bill: b[:number], customer: customer.name, to: msgs.map(&:to_phone) })
        render json: { sent: msgs.size, to: msgs.map(&:to_phone), statuses: msgs.map(&:status) }, status: :created
      end

      # GET /customer_bills?from=&to=&min_balance_minor=&q=  one summary row per customer for the Bills screen
      def index
        from, to = period
        scope = Customer.active.where(is_walk_in: false).order(:khata_no)
        scope = Customer.lookup(params[:q]).where(is_walk_in: false).order(:khata_no) if params[:q].present?
        scope = with_account_activity(scope, from, to) unless params[:all] == "true"
        customers = scope.to_a
        statements = Customers::Ledger.statements(customers, from: from, to: to, items: false)
        rows = customers.filter_map do |c|
          st = statements[c.id]
          next if params[:all] != "true" && st[:entries].empty? && st[:closing_balance_minor].zero?
          { customer: CustomerSerializers.customer(c), brought_forward_minor: st[:brought_forward_minor], closing_balance_minor: st[:closing_balance_minor], totals: st[:totals],
            entries_count: st[:entries].size, phones: c.account_phones }
        end
        min = params[:min_balance_minor].to_i
        rows = rows.select { |r| r[:closing_balance_minor] >= min } if params[:min_balance_minor].present?
        render json: { from: from, to: to, due_on: due_on, rows: rows,
                       totals: { customers: rows.size, due_minor: rows.sum { |r| [ r[:closing_balance_minor], 0 ].max }, charges_minor: rows.sum { |r| r[:totals][:charges_minor] },
                                 payments_minor: rows.sum { |r| r[:totals][:payments_minor] } },
                       last_run: BillRun.order(created_at: :desc).first&.then { |r| Customers::Bills.serialize(r) } }
      end

      # GET /customer_bills.pdf?from=&to=&customer_ids[]=  every bill in one PDF, one customer per page
      def bills_pdf
        from, to = period
        scope = Customer.active.where(is_walk_in: false).order(:khata_no)
        scope = params[:customer_ids].present? ? scope.where(id: Array(params[:customer_ids])) : with_account_activity(scope, from, to)
        customers = scope.to_a
        statements = Customers::Ledger.statements(customers, from: from, to: to)
        bills = customers.map { |c| build_bill(c, statement: statements[c.id]) }.reject { |b| params[:customer_ids].blank? && b[:entries].empty? && b[:closing_balance_minor].zero? }
        raise Api::Errors::Conflict.new("bills.empty", "No customer has anything on account in this period") if bills.empty?
        send_data Customers::BillPdf.render(bills), filename: "bills-#{to.strftime('%Y-%m')}.pdf", type: "application/pdf"
      end

      # GET /bill_runs
      def runs
        render json: { data: BillRun.order(created_at: :desc).limit(50).map { |r| Customers::Bills.serialize(r) } }
      end

      def show_run
        render json: Customers::Bills.serialize(BillRun.find(params[:id]), full: true)
      end

      # POST /bill_runs { from?, to?, due_on?, customer_ids?, min_balance_minor? }  Send bills now.
      def create_run
        require_permission!(*SEND)
        from, to = period
        run = Customers::Bills.run!(from: from, to: to, actor: current_membership, customer_ids: params[:customer_ids].presence, due_on: due_on,
                                    min_balance_minor: params[:min_balance_minor].presence&.to_i)
        render json: Customers::Bills.serialize(run, full: true), status: :created
      end

      private

      def period
        @period ||= begin
          if params[:from].present? || params[:to].present?
            from = params[:from].present? ? Date.parse(params[:from]) : today.beginning_of_month
            to = params[:to].present? ? Date.parse(params[:to]) : today
            raise Api::Errors::BadRequest.new("bill.period", "The end date is before the start date") if to < from
            [ from, to ]
          else
            Customers::Bill.last_month(today)
          end
        rescue Date::Error
          raise Api::Errors::BadRequest.new("bill.period", "Dates must be YYYY-MM-DD")
        end
      end

      def due_on
        return @due_on if defined?(@due_on)
        @due_on = params[:due_on].present? ? Date.parse(params[:due_on]) : Customers::Bill.due_on_for(current_business, today)
      end

      # Customers with a balance today or any account history up to the end of the period (an old balance paid off
      # later still shows on that month's bill). Customers who never used an account are skipped, which keeps the
      # screen fast for a restaurant with thousands of walk-in customers on file.
      def with_account_activity(scope, _from, to)
        active_ids = Payment.where(method_code: "khata", status: "captured", business_day: ..to).select(:customer_id)
        paid_ids = CustomerPayment.where(business_day: ..to).select(:customer_id)
        adj_ids = CustomerAdjustment.where(effective_on: ..to).select(:customer_id)
        scope.where("customers.balance_minor <> 0").or(scope.where(id: active_ids)).or(scope.where(id: paid_ids)).or(scope.where(id: adj_ids))
      end

      def build_bill(customer, statement: nil) = Customers::Bill.build(customer, from: period[0], to: period[1], due_on: due_on, issued_on: today, statement: statement)

      def serialize(a)
        { id: a.id, number: a.number, label: a.label, customer_id: a.customer_id, kind: a.kind, amount_minor: a.amount_minor, reason: a.reason, effective_on: a.effective_on,
          business_day: a.business_day, by_membership_id: a.by_membership_id, approved_by_membership_id: a.approved_by_membership_id, reverses_id: a.reverses_id,
          reverses_label: a.reverses&.label, reversed: a.reversed?, reversed_by_label: a.reversal&.label, created_at: a.created_at }
      end
    end
  end
end

module Payments
  # Takes one or more payments against an order in a single transaction: rounding, change, tips, khata limits,
  # account postings, order status. Repeating a payment id is a no-op.
  class Processor
    Result = Struct.new(:order, :payments, :change_minor, keyword_init: true)

    def initialize(order, actor:, device: nil, shift: nil)
      @order, @actor, @device, @shift = order, actor, device, shift
      @business = order.business
    end

    # payments: [{ id?, method_code, amount_minor, tendered_minor?, reference?, card_terminal_ref?, tip_minor? }]
    def call(payments:, tip_minor: 0)
      lines = Array(payments).map { |p| p.to_h.with_indifferent_access }
      existing = lines.map { |l| l[:id].presence && Payment.find_by(id: l[:id]) }
      return Result.new(order: @order, payments: existing.compact, change_minor: 0) if lines.any? && existing.all?
      raise Api::Errors::Conflict.new("order.status", "Order is #{@order.status} and cannot be paid") unless @order.status.in?(%w[draft held placed preparing ready served dispatched])
      raise Api::Errors::Conflict.new("order.empty", "Nothing to pay") if @order.active_items.empty?
      raise Api::Errors::BadRequest.new("payment.required", "At least one payment is required") if lines.empty?
      created = []
      change_total = 0
      raise Api::Errors::Conflict.new("day.locked", "#{@order.business_day} is locked") if @order.business_day && DayClose.locked?(@order.branch_id, @order.business_day)
      Order.transaction do
        Orders::Transitions.place!(@order, actor: @actor, device: @device) if @order.status.in?(%w[draft held])
        @order.tip_minor += tip_minor.to_i if tip_minor.to_i.positive?
        apply_rounding!(lines)
        Orders::Pricing.recalculate!(@order)
        due = @order.total_minor - @order.paid_minor
        lines.each do |l|
          if l[:id].present? && (existing = Payment.find_by(id: l[:id]))
            created << existing
            next
          end
          method = PaymentMethod.active.find_by!(code: l[:method_code].to_s)
          amount = l[:amount_minor].to_i
          raise Api::Errors::BadRequest.new("payment.amount", "Amount must be positive") unless amount.positive?
          raise Api::Errors::BadRequest.new("payment.reference_required", "#{method.name} needs a reference") if method.needs_reference && l[:reference].blank? && l[:card_terminal_ref].blank?
          remaining = due - created.sum(&:amount_minor)
          raise Api::Errors::Conflict.new("payment.overpaid", "Payment exceeds the amount due") if amount > remaining && !method.cash?
          applied = [ amount, remaining ].min
          raise Api::Errors::Conflict.new("payment.overpaid", "Order is already paid") if applied <= 0
          tendered = method.cash? ? [ l[:tendered_minor].to_i, amount ].max : nil
          change = method.cash? ? [ tendered - applied, 0 ].max : 0
          change_total += change
          payment = Payment.new(id: l[:id].presence, order: @order, branch_id: @order.branch_id, shift_id: @shift&.id, payment_method: method, payment_account: method.payment_account,
                                method_code: method.code, amount_minor: applied, tendered_minor: tendered, change_minor: change, reference: l[:reference].presence,
                                card_terminal_ref: l[:card_terminal_ref].presence, received_by_membership_id: @actor&.id, device_id: @device&.id, customer_id: @order.customer_id,
                                business_day: @order.business_day || Date.current, received_at: Time.current, client_created_at: l[:client_created_at])
          handle_khata!(method, applied)
          payment.shift_id ||= @shift&.id
          payment.save!
          post_to_account!(payment)
          created << payment
        end
        @order.paid_minor += created.sum(&:amount_minor) - (created.select { |c| c.created_at < 1.second.ago }.sum(&:amount_minor))
        @order.paid_minor = Payment.where(order_id: @order.id, status: "captured").sum(:amount_minor)
        @order.payment_method_summary = Payment.where(order_id: @order.id, status: "captured").group(:method_code).sum(:amount_minor).map { |k, v| "#{k}:#{v}" }.join(",")
        Orders::Pricing.recalculate!(@order)
        @order.save!
        finalize_paid! if @order.payment_status == "paid"
      end
      notify_khata!(created)
      Result.new(order: @order.reload, payments: created, change_minor: change_total)
    end

    # A sale put on a customer account is messaged to the customer on WhatsApp (setting khata.notify_each_sale).
    def notify_khata!(created)
      return unless created.any? { |p| p.method_code == "khata" && p.previously_new_record? }
      Customers::Notify.sale!(@order.reload)
    rescue StandardError => e
      Rails.logger.error("[khata] sale message failed for #{@order.id}: #{e.message}")
    end

    # What happens once an order is paid in full: receipt number, Paid status, customer stats, loyalty points, the tax
    # invoice and the audit row. Also used to complete an order whose payments already cover a corrected total.
    def finalize_paid!
      @order.receipt_number ||= "#{@order.business_day&.strftime('%y%m%d')}-#{@order.branch.code}-#{@order.serial}"
      Orders::Transitions.mark_paid!(@order, actor: @actor, device: @device)
      update_customer_stats!
      Loyalty.earn!(@order)
      Tax::Invoicer.enqueue_for(@order)
      AuditLog.record(action: "create", record: @order, after: { paid_minor: @order.paid_minor, methods: @order.payment_method_summary }, table_name: "payments")
    end

    private

    # Cash rounding (Rs 5 or Rs 10) on the first cash payment, on top of the whole-rupee total Pricing already rounded;
    # kept in cash_rounding_minor so every later recalculation keeps it.
    def apply_rounding!(lines)
      step = @business.setting("cash_rounding").to_i * 100
      return unless step.positive? && lines.any? { |l| l[:method_code].to_s == "cash" } && @order.paid_minor.zero?
      @order.cash_rounding_minor = 0
      Orders::Pricing.recalculate!(@order)
      @order.cash_rounding_minor = Orders::Rounding.round(@order.total_minor, step) - @order.total_minor
    end

    def handle_khata!(method, amount)
      return unless method.khata?
      BusinessModules.require!(@business, "customer_accounts")
      raise Api::Errors::Conflict.new("khata.no_customer", "Choose a customer to put this order on account") if @order.customer_id.blank?
      customer = Customer.active.lock.find(@order.customer_id)
      raise Api::Errors::Conflict.new("khata.walk_in", "Walk-in customers cannot buy on account") if customer.is_walk_in
      raise Api::Errors::Conflict.new("khata.over_limit", "#{customer.name} would exceed the credit limit of #{customer.credit_limit_minor / 100}") if customer.over_limit?(amount)
      customer.update!(balance_minor: customer.balance_minor + amount)
    end

    def post_to_account!(payment)
      return Finance::Journal.khata_sale!(payment) if payment.payment_method.khata?
      account = payment.payment_method.cash? && @shift&.drawer_account ? @shift.drawer_account : payment.payment_account
      return unless account
      payment.update_column(:payment_account_id, account.id)
      account.post!(kind: "order_payment", amount_minor: payment.amount_minor, business_day: payment.business_day, ref: payment,
                    description: "Order #{@order.label} #{payment.method_code}", by: @actor, shift_id: @shift&.id, branch_id: @order.branch_id)
    end

    def update_customer_stats!
      return if @order.customer_id.blank?
      Customer.where(id: @order.customer_id).update_all([ "orders_count = orders_count + 1, net_spent_minor = net_spent_minor + ?, last_order_at = ?", @order.total_minor, Time.current ])
    end
  end
end
